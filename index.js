require("dotenv").config();
const mongoose = require("mongoose");

const startWeb3 = require("./web3");
const retryInterval = 10000;
const maxRetryCount = 5;

const start = async (retryCount) => {
  try {
    console.log("Iteration:", retryCount);
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
    if (retryCount) {
      retryCount = retryCount - 1;
      setTimeout(() => {
        start(retryCount);
      }, retryInterval);
    } else {
      console.log(e.message);
      process.exit(1);
    }
  }
};

start(maxRetryCount);
