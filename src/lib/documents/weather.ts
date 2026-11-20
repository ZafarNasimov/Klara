// Weather evidence from Open-Meteo (no key; SPEC §2). Best effort: a blocked
// network or timeout just means no weather evidence.
import "server-only";
import { berlinDay } from "@/lib/deadlines";

const CODES: Record<number, string> = {
  0: "klar", 1: "überwiegend klar", 2: "teilweise bewölkt", 3: "bedeckt", 45: "Nebel", 48: "Nebel mit Reif",
  51: "leichter Nieselregen", 53: "Nieselregen", 55: "starker Nieselregen", 61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  66: "gefrierender Regen", 67: "starker gefrierender Regen", 71: "leichter Schneefall", 73: "Schneefall", 75: "starker Schneefall",
  77: "Schneegriesel", 80: "Regenschauer", 81: "Regenschauer", 82: "heftige Regenschauer", 85: "Schneeschauer", 86: "starke Schneeschauer",
  95: "Gewitter", 96: "Gewitter mit Hagel", 99: "schweres Gewitter mit Hagel",
};

export type WeatherDay = {
  date: string;
  condition: string;
  temp_min: number;
  temp_max: number;
  wind_max_kmh: number;
  gust_max_kmh: number | null;
  source: string;
};

export async function fetchWeather(lat: number, lng: number, at: Date): Promise<WeatherDay | null> {
  if (process.env.WEATHER_DISABLED === "1") return null;
  const day = berlinDay(at);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weather_code,temperature_2m_min,temperature_2m_max,wind_speed_10m_max,wind_gusts_10m_max");
  url.searchParams.set("timezone", "Europe/Berlin");
  url.searchParams.set("start_date", day);
  url.searchParams.set("end_date", day);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      daily?: { weather_code: number[]; temperature_2m_min: number[]; temperature_2m_max: number[]; wind_speed_10m_max: number[]; wind_gusts_10m_max?: number[] };
    };
    const d = j.daily;
    if (!d?.weather_code?.length) return null;
    return {
      date: day,
      condition: CODES[d.weather_code[0]] ?? `Code ${d.weather_code[0]}`,
      temp_min: d.temperature_2m_min[0],
      temp_max: d.temperature_2m_max[0],
      wind_max_kmh: d.wind_speed_10m_max[0],
      gust_max_kmh: d.wind_gusts_10m_max?.[0] ?? null,
      source: "Open-Meteo",
    };
  } catch {
    return null;
  }
}

export function weatherText(w: WeatherDay): string {
  const gust = w.gust_max_kmh != null ? `, Böen bis ${Math.round(w.gust_max_kmh)} km/h` : "";
  return `${w.condition}, ${Math.round(w.temp_min)} bis ${Math.round(w.temp_max)} °C, Wind bis ${Math.round(w.wind_max_kmh)} km/h${gust} (${w.source})`;
}
