require("dotenv").config();
const { web3, web3Ws } = require("./web3");
const mongoose = require("mongoose");

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected...");
  } catch (e) {
    console.log(e.message);
    process.exit(1); // kill process if could not connect to mongoDB
  }
};

start();
