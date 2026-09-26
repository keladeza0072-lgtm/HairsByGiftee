"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

exports.checkoutStatus = onRequest((req, res) => {
  res.status(503).json({
    ready: false,
    message: "Secure online payments are not enabled yet."
  });
});
