const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const infoSchema = new Schema({
  lastBlock: { type: Number },
  totalBurned: { type: Number },
  ethSpent: { type: Number },
  maxBurns: { type: Number },
});

module.exports = mongoose.model("Info", infoSchema);
