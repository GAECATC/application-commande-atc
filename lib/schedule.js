const TIME_ZONE = "Europe/Paris";

function parisParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday
  };
}

function utcDateFromParisParts(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

function addDaysIso(parts, days) {
  const date = utcDateFromParisParts(parts);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getNextDelivery(date = new Date()) {
  const parts = parisParts(date);
  const weekdayIndex = {
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
    dimanche: 0
  }[parts.weekday.toLowerCase()];

  const daysUntilThursday = (4 - weekdayIndex + 7) % 7;
  const daysUntilMonday = (1 - weekdayIndex + 7) % 7;
  const targetIsThursday = weekdayIndex >= 1 && weekdayIndex <= 3;
  const daysToAdd = targetIsThursday ? daysUntilThursday : daysUntilMonday || 7;
  const harvestDay = targetIsThursday ? "jeudi" : "lundi";
  const cutoffDay = targetIsThursday ? "mercredi soir" : "dimanche soir";

  return {
    deliveryDate: addDaysIso(parts, daysToAdd),
    harvestDay,
    cutoffLabel: cutoffDay,
    label: `Commande pour la récolte du ${harvestDay}`,
    timezone: TIME_ZONE
  };
}

module.exports = { getNextDelivery, TIME_ZONE };
