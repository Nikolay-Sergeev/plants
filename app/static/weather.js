import { chevronIcon, esc, glyph, leafIcon } from "./ui.js?v=1";

const weatherSymbols = [
  [[0], "clear",
    '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    '<path d="M20.5 15A8.5 8.5 0 0 1 9 3.5 8.5 8.5 0 1 0 20.5 15Z"/>'],
  [[1, 2], "bright",
    '<path d="M3 7h2m1-3 1.5 1.5M11 2v2m4.5 1.5L17 4m-2.2 6A4 4 0 1 0 7 12m.5 8a3.5 3.5 0 1 1 .7-6.9 5 5 0 0 1 9.4 1.9h1.4a2.5 2.5 0 1 1 0 5z"/>',
    '<path d="M7.7 11.7a5.2 5.2 0 0 1 1.1-9A5 5 0 0 0 15.1 9M7.5 20a3.5 3.5 0 1 1 .7-6.9 5 5 0 0 1 9.4 1.9H19a2.5 2.5 0 1 1 0 5z"/>'],
  [[3], "cloud", '<path d="M6.5 19a4 4 0 1 1 .8-7.9 5.5 5.5 0 0 1 10.5 2.4H19a2.75 2.75 0 0 1 0 5.5z"/>'],
  [[45, 48], "cloud", '<path d="M5 13a3.2 3.2 0 1 1 1-6.2 5.2 5.2 0 0 1 9.9 1.4 2.6 2.6 0 1 1 3 4.8zM4 17h16M7 21h10"/>'],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], "rain", '<path d="M6 15a3.5 3.5 0 1 1 .7-6.9 5 5 0 0 1 9.8 1.4H19a2.75 2.75 0 0 1 0 5.5zM9 18l-1 3m5-3-1 3m5-3-1 3"/>'],
  [[71, 73, 75, 77, 85, 86], "cloud", '<path d="M6 14a3.5 3.5 0 1 1 .7-6.9 5 5 0 0 1 9.8 1.4H19a2.75 2.75 0 0 1 0 5.5zM7 18h.01m4 3h.01m2-3h.01m4 3h.01m2-3h.01"/>'],
  [[95, 96, 99], "bright", '<path d="M8 14H6a3.5 3.5 0 1 1 .7-6.9 5 5 0 0 1 9.8 1.4H19a2.75 2.75 0 0 1 0 5.5h-2m-4-2-3 5h4l-2 5"/>'],
];

function weatherSymbol(code, isDay) {
  const symbol = weatherSymbols.find(([codes]) => codes.includes(code));
  if (!symbol) return "";
  const [, tone, dayShape, nightShape] = symbol;
  const night = isDay === 0 && nightShape;
  return `<span class="wx-symbol wx-${night ? "night" : tone}">${glyph(night || dayShape)}</span>`;
}

function weatherValue(value, unit, round = false) {
  return Number.isFinite(value) ? `${round ? Math.round(value) : value}${esc(unit)}` : "—";
}

function temperatureRange(low, high, { minimum, spread }) {
  const hasRange = Number.isFinite(low) && Number.isFinite(high) && low <= high;
  if (!hasRange) return "";
  const start = spread ? (low - minimum) / spread * 100 : 50;
  const end = spread ? 100 - (high - minimum) / spread * 100 : 50;
  return `<span class="wx-range" style="--start:${start}%;--end:${end}%"></span>`;
}

function forecastDay(day, bounds, precipitationUnit) {
  const rain = Number.isFinite(day.precip_probability) && day.precip_probability > 0;
  const details = [day.summary, rain ? `${day.precip_probability}% chance of precipitation` : "",
    day.precip > 0 ? `${day.precip} ${precipitationUnit} expected` : ""].filter(Boolean).join(" · ");
  return `<li class="wx-day">
    <span class="wx-day-name">${esc(day.short)}</span>
    <span class="wx-condition" title="${esc(details)}">
      <span aria-hidden="true">${weatherSymbol(day.code)}${rain ? `<small>${day.precip_probability}%</small>` : ""}</span>
      <span class="sr-only">${esc(details)}</span>
    </span>
    <span class="wx-low"><span class="sr-only">Low </span>${weatherValue(day.low, "°", true)}</span>
    <span class="wx-track" aria-hidden="true">${temperatureRange(day.low, day.high, bounds)}</span>
    <span class="wx-high"><span class="sr-only">High </span>${weatherValue(day.high, "°", true)}</span>
  </li>`;
}

function forecastHtml(days, precipitationUnit) {
  if (!days.length) return "";
  const temperatures = days.flatMap(({ low, high }) => [low, high]).filter(Number.isFinite);
  const minimum = temperatures.length ? Math.min(...temperatures) : 0;
  const bounds = { minimum, spread: temperatures.length ? Math.max(...temperatures) - minimum : 0 };
  const rows = days.map((day) => forecastDay(day, bounds, precipitationUnit)).join("");
  return `<section class="wx-forecast" aria-labelledby="weather-forecast-title">
    <h2 id="weather-forecast-title">${days.length}-day forecast</h2>
    <ul class="wx-days" role="list">${rows}</ul>
  </section>`;
}

function currentWeatherHtml(weather, temperature) {
  const { current, units } = weather;
  const [city, ...region] = (weather.location || "Local weather").split(", ");
  const [today] = weather.daily;
  return `<div class="wx-current">
    <div>
      <h2>${esc(city)}</h2>
      ${region.length ? `<p class="wx-region">${esc(region.join(", "))}</p>` : ""}
      <p class="wx-temperature">${temperature}</p>
      ${current.summary ? `<p class="wx-description">${esc(current.summary)}</p>` : ""}
      ${today ? `<p class="wx-today-range">High ${weatherValue(today.high, "°", true)} · Low ${weatherValue(today.low, "°", true)}</p>` : ""}
    </div>
    <div class="wx-current-symbol" aria-hidden="true">${weatherSymbol(current.code, current.is_day)}</div>
  </div>
  <dl class="wx-stats">
    <div><dt>Humidity</dt><dd>${weatherValue(current.humidity, "%")}</dd></div>
    <div><dt>Wind</dt><dd>${weatherValue(current.wind, ` ${units.wind}`, true)}</dd></div>
    <div><dt>Rain now</dt><dd>${weatherValue(current.precipitation, ` ${units.precipitation}`)}</dd></div>
  </dl>`;
}

function weatherFooter(weather) {
  const days = weather.daily.length;
  const total = Number.isFinite(weather.rain_total) && days
    ? `<span>Rain over ${days} days · ${weatherValue(weather.rain_total, ` ${weather.units.precipitation}`)}</span>` : "";
  return `<div class="wx-foot">
    ${total}
    <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>${weather.stale ? "<span>Cached forecast</span>" : ""}
  </div>`;
}

function unavailableWeatherHtml(error, canConfigure) {
  if (error) return esc(error);
  return canConfigure ? '<a href="#/settings/weather">Set a weather location</a>' : "No weather location is set.";
}

export function weatherHtml(weather, { open, canConfigure }) {
  const disclosure = open ? "open" : "";
  if (!weather?.configured || weather.error) {
    return `<details class="disclosure weather" id="weather" ${disclosure}>
      <summary><span>Weather</span>${chevronIcon}</summary>
      <div class="disclosure-body muted">${unavailableWeatherHtml(weather?.error, canConfigure)}</div>
    </details>`;
  }
  const temperature = weatherValue(weather.current.temperature, weather.units.temperature, true);
  const summary = weather.current.summary ? ` · ${esc(weather.current.summary)}` : "";
  return `<details class="disclosure weather weather-ready" id="weather" ${disclosure}>
    <summary><span>Weather</span><span class="disclosure-meta wx-summary">${temperature}${summary}</span>${chevronIcon}</summary>
    <div class="disclosure-body weather-body">
      ${currentWeatherHtml(weather, temperature)}
      ${forecastHtml(weather.daily, weather.units.precipitation)}
      ${weather.hint ? `<p class="wx-hint">${leafIcon}<span>${esc(weather.hint)}</span></p>` : ""}
      ${weatherFooter(weather)}
    </div>
  </details>`;
}
