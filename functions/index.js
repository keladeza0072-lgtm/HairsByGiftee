"use strict";

const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { calculateNigeriaShipping } = require("./shipping");

initializeApp();
const db = getFirestore();
const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const SOURCE_COLLECTIONS = {
  product: "products",
  deal: "hotDeals",
  class: "classes"
};

function json(res, status, body) {
  res.status(status).set("Cache-Control", "no-store").json(body);
}

function stockCount(item) {
  if (item.stock === null || item.stock === undefined || item.stock === "") return 1;
  const n = Math.floor(Number(item.stock));
  return Number.isFinite(n) ? Math.max(0, n) : 1;
}

function cleanText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function makeReference() {
  return "HBG-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function paystackRequest(path, options = {}) {
  const response = await fetch("https://api.paystack.co" + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + PAYSTACK_SECRET_KEY.value(),
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== true) {
    throw new Error(data.message || "Paystack request failed");
  }
  return data.data;
}

async function verifyAndFinalize(reference) {
  const orderRef = db.collection("orders").doc(reference);
  const existing = await orderRef.get();
  if (!existing.exists) throw new Error("Order not found");

  const order = existing.data();
  if (order.status === "paid") return order;

  const tx = await paystackRequest("/transaction/verify/" + encodeURIComponent(reference), { method: "GET" });
  if (tx.status !== "success") throw new Error("Payment has not been completed");
  if (String(tx.reference) !== reference) throw new Error("Payment reference mismatch");
  if (Number(tx.amount) !== Number(order.amountKobo)) throw new Error("Payment amount mismatch");
  if (String(tx.currency || "").toUpperCase() !== "NGN") throw new Error("Payment currency mismatch");

  await db.runTransaction(async transaction => {
    const freshOrderSnap = await transaction.get(orderRef);
    if (!freshOrderSnap.exists) throw new Error("Order not found");
    const freshOrder = freshOrderSnap.data();
    if (freshOrder.status === "paid") return;

    const itemRef = db.collection(freshOrder.sourceCollection).doc(freshOrder.itemId);
    const itemSnap = await transaction.get(itemRef);

    if (itemSnap.exists) {
      const item = itemSnap.data();
      const currentStock = stockCount(item);
      const nextStock = Math.max(0, currentStock - Number(freshOrder.quantity || 1));
      transaction.update(itemRef, {
        stock: nextStock,
        available: nextStock > 0
      });
    }

    transaction.update(orderRef, {
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
      paystackTransactionId: tx.id || null,
      paymentChannel: tx.channel || null,
      paidAmountKobo: Number(tx.amount),
      currency: "NGN"
    });
  });

  const paid = await orderRef.get();
  return paid.data();
}

exports.initializePaystackPayment = onRequest(
  { secrets: [PAYSTACK_SECRET_KEY] },
  async (req, res) => {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    try {
      const kind = cleanText(req.body?.kind, 20);
      const sourceCollection = SOURCE_COLLECTIONS[kind];
      if (!sourceCollection) return json(res, 400, { error: "Invalid item type" });

      const itemId = cleanText(req.body?.itemId, 150);
      const quantity = Math.max(1, Math.floor(Number(req.body?.quantity || 1)));
      const name = cleanText(req.body?.name, 120);
      const email = cleanText(req.body?.email, 200).toLowerCase();
      const phone = cleanText(req.body?.phone, 60);
      const country = cleanText(req.body?.country, 80);
      const state = cleanText(req.body?.state, 100);
      const address = cleanText(req.body?.address, 500);
      const note = cleanText(req.body?.note, 500);

      if (!itemId || !name || !phone || !validEmail(email)) {
        return json(res, 400, { error: "Please complete your name, email and phone number." });
      }

      const itemSnap = await db.collection(sourceCollection).doc(itemId).get();
      if (!itemSnap.exists) return json(res, 404, { error: "This item is no longer available." });

      const item = itemSnap.data();
      const availableStock = stockCount(item);
      if (item.available === false || availableStock < quantity) {
        return json(res, 409, { error: "There is not enough stock available for this order." });
      }

      const unitPrice = Number(item.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return json(res, 400, { error: "This item does not have a valid price." });
      }

      const subtotal = unitPrice * quantity;
      let deliveryFee = 0;
      let deliveryZone = kind === "class" ? "Class booking" : "";

      if (kind !== "class") {
        if (country !== "Nigeria") {
          return json(res, 400, { error: "Online payment is currently available for Nigerian delivery only. Please contact HairsByGiftee for international delivery." });
        }
        if (!state || !address) {
          return json(res, 400, { error: "Please complete your delivery state and address." });
        }
        const settingsSnap = await db.collection("settings").doc("checkout").get();
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const shipping = calculateNigeriaShipping(settings, state, subtotal);
        deliveryFee = Number(shipping.fee || 0);
        deliveryZone = shipping.zone;
      }

      const total = subtotal + deliveryFee;
      const amountKobo = Math.round(total * 100);
      const reference = makeReference();

      await db.collection("orders").doc(reference).set({
        reference,
        status: "payment_pending",
        kind,
        sourceCollection,
        itemId,
        itemName: cleanText(item.name, 200),
        unitPrice,
        quantity,
        subtotal,
        deliveryFee,
        deliveryZone,
        total,
        amountKobo,
        currency: "NGN",
        customer: { name, email, phone },
        delivery: kind === "class" ? null : { country, state, address },
        note,
        createdAt: FieldValue.serverTimestamp()
      });

      const origin = String(req.get("origin") || "https://hairsbygiftee.web.app").replace(/\/$/, "");
      const callbackUrl = origin + "/";

      const initialized = await paystackRequest("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            order_reference: reference,
            item_name: cleanText(item.name, 200),
            quantity
          }
        })
      });

      await db.collection("orders").doc(reference).update({
        paystackAccessCode: initialized.access_code || null,
        paystackAuthorizationUrl: initialized.authorization_url || null
      });

      return json(res, 200, {
        reference,
        authorizationUrl: initialized.authorization_url
      });
    } catch (error) {
      console.error("initializePaystackPayment", error);
      return json(res, 500, { error: error.message || "Unable to start payment." });
    }
  }
);

exports.verifyPaystackPayment = onRequest(
  { secrets: [PAYSTACK_SECRET_KEY] },
  async (req, res) => {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    try {
      const reference = cleanText(req.query.reference, 150);
      if (!reference) return json(res, 400, { error: "Missing payment reference" });

      const order = await verifyAndFinalize(reference);
      return json(res, 200, {
        paid: order.status === "paid",
        reference,
        itemName: order.itemName,
        quantity: order.quantity,
        total: order.total,
        currency: order.currency || "NGN"
      });
    } catch (error) {
      console.error("verifyPaystackPayment", error);
      return json(res, 400, { paid: false, error: error.message || "Unable to verify payment." });
    }
  }
);

exports.paystackWebhook = onRequest(
  { secrets: [PAYSTACK_SECRET_KEY] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    try {
      const signature = String(req.get("x-paystack-signature") || "");
      const expected = crypto
        .createHmac("sha512", PAYSTACK_SECRET_KEY.value())
        .update(req.rawBody)
        .digest("hex");

      if (!signature || signature.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(401).send("Invalid signature");
      }

      const event = req.body || {};
      if (event.event === "charge.success" && event.data?.reference) {
        await verifyAndFinalize(String(event.data.reference));
      }

      return res.status(200).send("ok");
    } catch (error) {
      console.error("paystackWebhook", error);
      return res.status(200).send("ok");
    }
  }
);

exports.checkoutStatus = onRequest((req, res) => {
  res.status(200).json({
    ready: true,
    provider: "paystack",
    mode: "test"
  });
});
