// Weather evidence: parsing Open-Meteo, the "unusual weather" call, and no invented data on failure.
import { afterEach, describe, expect, it, vi } from "vitest";
import { berlinTime } from "@/lib/deadlines";
import { conditionDe, fetchWeather, weatherFromResponse } from "./weather";

const DAY = "2026-11-20";
const hours = Array.from({ length: 24 }, (_, h) => `${DAY}T${String(h).padStart(2, "0")}:00`);

/** One day as Open-Meteo returns it with timezone=Europe/Berlin. */
function response(o: { gustMax: number; gustAt7: number; precip: number; code: number; tmin?: number; tmax?: number }) {
  return {
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, h) => (h === 7 ? 6.2 : 8)),
      precipitation: hours.map(() => o.precip / 24),
      weather_code: hours.map(() => o.code),
      wind_gusts_10m: hours.map((_, h) => (h === 7 ? o.gustAt7 : 20)),
    },
    daily: {
      time: [DAY],
      temperature_2m_max: [o.tmax ?? 9.4],
      temperature_2m_min: [o.tmin ?? 4.1],
      precipitation_sum: [o.precip],
      wind_gusts_10m_max: [o.gustMax],
      weather_code: [o.code],
    },
  };
}

const at = berlinTime(DAY, 7, 0);

describe("weatherFromResponse", () => {
  it("records a storm as unusual, with the values at the event hour", () => {
    const w = weatherFromResponse(response({ gustMax: 96, gustAt7: 88, precip: 6.3, code: 63 }), at, 48.14, 11.58)!;
    expect(w).toMatchObject({ day: DAY, condition_de: "Regen", gust_max_kmh: 96, gust_at_kmh: 88, temp_at_c: 6.2 });
    expect(w.unusual).toEqual(["Sturmböen bis 96 km/h"]);
    expect(w.summary_de).toBe(
      "20.11.2026: Regen, 4 bis 9 °C, Niederschlag 6,3 mm, Böen bis 96 km/h; um 07:00 Uhr 6 °C, Böen 88 km/h (Open-Meteo)",
    );
  });

  it("treats an ordinary November day as usual weather", () => {
    const w = weatherFromResponse(response({ gustMax: 38, gustAt7: 25, precip: 1.2, code: 3 }), at, 48.14, 11.58)!;
    expect(w.unusual).toEqual([]);
    expect(w.condition_de).toBe("Bedeckt");
  });

  it("returns null when the day is not in the answer", () => {
    expect(weatherFromResponse(response({ gustMax: 30, gustAt7: 20, precip: 0, code: 0 }), berlinTime("2026-11-21", 7, 0), 48, 11)).toBeNull();
  });

  it("names WMO codes in German", () => {
    expect([0, 3, 45, 61, 65, 73, 81, 95].map(conditionDe)).toEqual([
      "Klar",
      "Bedeckt",
      "Nebel",
      "Regen",
      "Starker Regen",
      "Schneefall",
      "Regenschauer",
      "Gewitter",
    ]);
  });
});

describe("fetchWeather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks Open-Meteo for the site and day in Berlin time", async () => {
    vi.stubEnv("WEATHER_DISABLED", "0");
    const fetchMock = vi.fn(async () => Response.json(response({ gustMax: 96, gustAt7: 88, precip: 6.3, code: 63 })));
    vi.stubGlobal("fetch", fetchMock);
    const w = await fetchWeather(48.137, 11.575, at);
    expect(w?.unusual).toHaveLength(1);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("latitude")).toBe("48.137");
    expect(url.searchParams.get("start_date")).toBe(DAY);
    expect(url.searchParams.get("timezone")).toBe("Europe/Berlin");
  });

  it("gives no weather (rather than made-up weather) when the service refuses", async () => {
    vi.stubEnv("WEATHER_DISABLED", "0");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: true, reason: "Daily API request limit exceeded." }, { status: 429 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await fetchWeather(48.137, 11.575, at)).toBeNull();
  });

  it("is off when WEATHER_DISABLED=1", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchWeather(48.137, 11.575, at)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
