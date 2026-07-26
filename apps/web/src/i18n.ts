/**
 * Minimal bilingual strings (sv default for Swedish locales, else en).
 * Hand-rolled on purpose — ~30 strings don't justify an i18n library (family beta).
 */

export interface Strings {
  tagline: string;
  startDefaultNote: string;
  startGeoNote: string;
  startPinNote: string;
  locationDenied: string;
  useMyLocation: string;
  distanceLabel: string;
  generate: string;
  generating: string;
  shuffle: string;
  gpx: string;
  newSearch: string;
  loop: string;
  outAndBack: string;
  surfaceUnknown: string;
  noValidTitle: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  km: string;
  routesFound: (n: number) => string;
}

const en: Strings = {
  tagline: 'Running loops at exactly the distance you want',
  startDefaultNote: 'Start: Köpmangatan 5, Gamla stan (drag the pin to move)',
  startGeoNote: 'Start: your location (drag the pin to move)',
  startPinNote: 'Start: dropped pin',
  locationDenied: 'Location unavailable — starting from Köpmangatan 5, Gamla stan',
  useMyLocation: 'Use my location',
  distanceLabel: 'How far?',
  generate: 'Find routes',
  generating: 'Finding loops near you…',
  shuffle: 'Shuffle',
  gpx: 'Export GPX',
  newSearch: 'New search',
  loop: 'Loop',
  outAndBack: 'Out & back',
  surfaceUnknown: 'surface partly unknown',
  noValidTitle: 'Nothing exact — closest we found:',
  errorTitle: 'Something went wrong',
  errorBody: 'Could not fetch routes. Check your connection and try again.',
  retry: 'Try again',
  km: 'km',
  routesFound: (n: number) => (n === 1 ? '1 route' : `${n} routes`),
};

const sv: Strings = {
  tagline: 'Löprundor på exakt den distans du vill ha',
  startDefaultNote: 'Start: Köpmangatan 5, Gamla stan (dra nålen för att flytta)',
  startGeoNote: 'Start: din plats (dra nålen för att flytta)',
  startPinNote: 'Start: nedsläppt nål',
  locationDenied: 'Plats ej tillgänglig — startar från Köpmangatan 5, Gamla stan',
  useMyLocation: 'Använd min plats',
  distanceLabel: 'Hur långt?',
  generate: 'Hitta rundor',
  generating: 'Letar rundor nära dig…',
  shuffle: 'Slumpa nya',
  gpx: 'Exportera GPX',
  newSearch: 'Ny sökning',
  loop: 'Runda',
  outAndBack: 'Tur & retur',
  surfaceUnknown: 'underlag delvis okänt',
  noValidTitle: 'Inget exakt — närmast vi hittade:',
  errorTitle: 'Något gick fel',
  errorBody: 'Kunde inte hämta rundor. Kontrollera uppkopplingen och försök igen.',
  retry: 'Försök igen',
  km: 'km',
  routesFound: (n: number) => (n === 1 ? '1 runda' : `${n} rundor`),
};

export function pickStrings(language: string | undefined = navigator.language): Strings {
  return language?.toLowerCase().startsWith('sv') ? sv : en;
}
