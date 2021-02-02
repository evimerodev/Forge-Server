require("dotenv").config();
const mongoose = require("mongoose");

const startWeb3 = require("./web3");

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected...");

    startWeb3();
    console.log("Web3 started...");
  } catch (e) {
    console.log(e.message);
    process.exit(1); // kill process if could not connect to mongoDB
  }
};

start();
