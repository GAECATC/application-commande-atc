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
  const deliveryOffset = targetIsThursday ? 0 : 1;

  return {
    deliveryDate: addDaysIso(parts, daysToAdd + deliveryOffset),
    harvestDay,
    cutoffLabel: cutoffDay,
    label: `Commande pour la récolte du ${harvestDay}`,
    timezone: TIME_ZONE
  };
}

const WEDNESDAY_AND_FRIDAY_PARTNERS = new Set(["lixterrax", "halles-de-chartreuse"]);
const FRIDAY_ONLY_PARTNERS = new Set(["panier-saint-genix"]);

function getNextPartnerDelivery(partnerId, date = new Date()) {
  if (!WEDNESDAY_AND_FRIDAY_PARTNERS.has(partnerId) && !FRIDAY_ONLY_PARTNERS.has(partnerId)) {
    return getNextDelivery(date);
  }

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

  let daysToAdd;
  let deliveryDay;
  let cutoffLabel;

  if (FRIDAY_ONLY_PARTNERS.has(partnerId)) {
    daysToAdd = weekdayIndex === 5 ? 7 : (5 - weekdayIndex + 7) % 7;
    deliveryDay = "vendredi";
    cutoffLabel = "jeudi soir";
  } else if (weekdayIndex === 3 || weekdayIndex === 4) {
    daysToAdd = (5 - weekdayIndex + 7) % 7;
    deliveryDay = "vendredi";
    cutoffLabel = "jeudi soir";
  } else {
    daysToAdd = (3 - weekdayIndex + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7;
    deliveryDay = "mercredi";
    cutoffLabel = "mardi soir";
  }

  return {
    deliveryDate: addDaysIso(parts, daysToAdd),
    harvestDay: deliveryDay,
    cutoffLabel,
    label: `Commande pour la livraison du ${deliveryDay}`,
    timezone: TIME_ZONE
  };
}

module.exports = { getNextDelivery, getNextPartnerDelivery, TIME_ZONE };
