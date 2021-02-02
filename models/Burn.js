const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const burnSchema = new Schema({
  tokenId: { type: String, required: true },
  user: { type: String, required: true, lowercase: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Burn", burnSchema);
