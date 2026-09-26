"use strict";

const SHIPPING_ZONE_STATES = {
  "Lagos": ["Lagos"],
  "South West": ["Ekiti","Ogun","Ondo","Osun","Oyo"],
  "South East": ["Abia","Anambra","Ebonyi","Enugu","Imo"],
  "South South": ["Akwa Ibom","Bayelsa","Cross River","Delta","Edo","Rivers"],
  "North Central": ["Benue","FCT Abuja","Kogi","Kwara","Nasarawa","Niger","Plateau"],
  "North East": ["Adamawa","Bauchi","Borno","Gombe","Taraba","Yobe"],
  "North West": ["Jigawa","Kaduna","Kano","Katsina","Kebbi","Sokoto","Zamfara"]
};
const SHIPPING_ZONE_FIELDS = {
  "Lagos": "shippingLagos",
  "South West": "shippingSouthWest",
  "South East": "shippingSouthEast",
  "South South": "shippingSouthSouth",
  "North Central": "shippingNorthCentral",
  "North East": "shippingNorthEast",
  "North West": "shippingNorthWest"
};
function zoneForState(state) {
  const clean = String(state || "").trim();
  return Object.keys(SHIPPING_ZONE_STATES).find(zone => SHIPPING_ZONE_STATES[zone].includes(clean)) || "";
}
function calculateNigeriaShipping(settings, state, subtotal) {
  const zone = zoneForState(state);
  if (!zone) throw new Error("Unsupported Nigerian state");
  const threshold = Number(settings.freeShippingThreshold || 0);
  if (settings.freeShippingEnabled === true && threshold > 0 && Number(subtotal) >= threshold) {
    return { zone, fee: 0, free: true };
  }
  const field = SHIPPING_ZONE_FIELDS[zone];
  const fee = Number(settings[field]);
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Shipping rate is not configured");
  return { zone, fee, free: false };
}
module.exports = { SHIPPING_ZONE_STATES, SHIPPING_ZONE_FIELDS, zoneForState, calculateNigeriaShipping };
