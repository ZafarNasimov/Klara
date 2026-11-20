// Weather evidence from Open-Meteo (SPEC §2: no key, by project lat/lng).
// A hindrance from weather only counts when the weather was unusual
// (§ 6 Abs. 2 Nr. 2 VOB/B), so the record says whether it was.
// Thresholds are a first heuristic. TODO: legal review.
import "server-only";
import { berlinDay } from "@/lib/deadlines";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/labels";

export type WeatherRecord = {
  source: "open-meteo";
  /** Instant the record is about (event time). */
  at: string;
  day: string;
  lat: number;
  lng: number;
  condition_de: string;
  temp_min_c: number | null;
  temp_max_c: number | null;
  /** Temperature in the hour of the event. */
  temp_at_c: number | null;
  precipitation_mm: number | null;
  gust_max_kmh: number | null;
  /** Gusts in the hour of the event. */
  gust_at_kmh: number | null;
  /** Reasons the weather counts as unusual (empty = usual weather). */
  unusual: string[];
  summary_de: string;
};

const TIMEOUT_MS = 3500;
const HOURLY = ["temperature_2m", "precipitation", "weather_code", "wind_gusts_10m"] as const;
const DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_gusts_10m_max", "weather_code"] as const;

/** WMO weather codes as Open-Meteo reports them. */
export function conditionDe(code: number | null): string {
  if (code === null) return "Witterung unbekannt";
  if (code === 0) return "Klar";
  if (code <= 2) return "Leicht bewölkt";
  if (code === 3) return "Bedeckt";
  if (code === 45 || code === 48) return "Nebel";
  if (code >= 51 && code <= 57) return code >= 56 ? "Gefrierender Nieselregen" : "Nieselregen";
  if (code >= 61 && code <= 67) return code >= 66 ? "Gefrierender Regen" : code >= 65 ? "Starker Regen" : "Regen";
  if (code >= 71 && code <= 77) return code >= 75 ? "Starker Schneefall" : "Schneefall";
  if (code >= 80 && code <= 82) return code === 82 ? "Heftige Regenschauer" : "Regenschauer";
  if (code === 85 || code === 86) return "Schneeschauer";
  if (code >= 95) return "Gewitter";
  return "Witterung unbekannt";
}

type OpenMeteoResponse = {
  hourly?: Partial<Record<(typeof HOURLY)[number] | "time", (number | string | null)[]>>;
  daily?: Partial<Record<(typeof DAILY)[number] | "time", (number | string | null)[]>>;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Turn an Open-Meteo answer (timezone Europe/Berlin) into the record for one event instant. */
export function weatherFromResponse(json: OpenMeteoResponse, at: Date, lat: number, lng: number): WeatherRecord | null {
  const day = berlinDay(at);
  const d = json.daily;
  const di = d?.time?.indexOf(day) ?? -1;
  if (!d || di < 0) return null;
  const hourKey = `${day}T${fmtTime(at).slice(0, 2)}:00`;
  const hi = json.hourly?.time?.indexOf(hourKey) ?? -1;
  const h = (k: (typeof HOURLY)[number]) => (hi >= 0 ? num(json.hourly?.[k]?.[hi]) : null);

  const code = num(d.weather_code?.[di]);
  const rec = {
    temp_min_c: num(d.temperature_2m_min?.[di]),
    temp_max_c: num(d.temperature_2m_max?.[di]),
    precipitation_mm: num(d.precipitation_sum?.[di]),
    gust_max_kmh: num(d.wind_gusts_10m_max?.[di]),
    temp_at_c: h("temperature_2m"),
    gust_at_kmh: h("wind_gusts_10m"),
  };

  const unusual: string[] = [];
  if (rec.gust_max_kmh !== null && rec.gust_max_kmh >= 75) unusual.push(`Sturmböen bis ${fmtNumber(rec.gust_max_kmh)} km/h`);
  if (rec.precipitation_mm !== null && rec.precipitation_mm >= 25) unusual.push(`Starkregen ${fmtNumber(rec.precipitation_mm, 1)} mm`);
  if (rec.temp_min_c !== null && rec.temp_min_c <= -10) unusual.push(`Frost bis ${fmtNumber(rec.temp_min_c)} °C`);
  if (rec.temp_max_c !== null && rec.temp_max_c >= 35) unusual.push(`Hitze bis ${fmtNumber(rec.temp_max_c)} °C`);
  if (code !== null && code >= 95) unusual.push("Gewitter");

  const condition_de = conditionDe(code);
  const parts = [condition_de];
  if (rec.temp_min_c !== null && rec.temp_max_c !== null) parts.push(`${fmtNumber(rec.temp_min_c)} bis ${fmtNumber(rec.temp_max_c)} °C`);
  if (rec.precipitation_mm !== null) parts.push(`Niederschlag ${fmtNumber(rec.precipitation_mm, 1)} mm`);
  if (rec.gust_max_kmh !== null) parts.push(`Böen bis ${fmtNumber(rec.gust_max_kmh)} km/h`);
  const atHour =
    rec.temp_at_c !== null || rec.gust_at_kmh !== null
      ? `; um ${fmtTime(at)} Uhr ${[
          rec.temp_at_c !== null ? `${fmtNumber(rec.temp_at_c)} °C` : null,
          rec.gust_at_kmh !== null ? `Böen ${fmtNumber(rec.gust_at_kmh)} km/h` : null,
        ]
          .filter(Boolean)
          .join(", ")}`
      : "";

  return {
    source: "open-meteo",
    at: at.toISOString(),
    day,
    lat,
    lng,
    condition_de,
    ...rec,
    unusual,
    summary_de: `${fmtDate(day)}: ${parts.join(", ")}${atHour} (Open-Meteo)`,
  };
}

/** Weather at the site for the event instant; null when disabled or unreachable (never invented). */
export async function fetchWeather(lat: number, lng: number, at: Date): Promise<WeatherRecord | null> {
  if (process.env.WEATHER_DISABLED === "1") return null;
  const day = berlinDay(at);
  // The forecast API covers the last ~3 months; older days come from the archive.
  const old = Date.now() - at.getTime() > 80 * 86400000;
  const url = new URL(old ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: HOURLY.join(","),
    daily: DAILY.join(","),
    timezone: "Europe/Berlin",
    wind_speed_unit: "kmh",
    start_date: day,
    end_date: day,
  }).toString();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!r.ok) {
      console.warn("[klara] weather lookup failed", r.status, await r.text().catch(() => ""));
      return null;
    }
    return weatherFromResponse((await r.json()) as OpenMeteoResponse, at, lat, lng);
  } catch (err) {
    console.warn("[klara] weather lookup failed", err instanceof Error ? err.message : err);
    return null;
  }
}
