const mongoose = require("mongoose");
require("dotenv").config();

// Mongoose Models
const Token = require("../models/Token");
const Burn = require("../models/Burn");

const flush = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    });

    await Token.deleteMany();
    await Burn.deleteMany();

    console.log("DB Flushed!");

    process.exit(0);
  } catch (error) {
    console.log(error.message);
    process.exit(error);
  }
};

flush();
