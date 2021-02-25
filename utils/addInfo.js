const mongoose = require("mongoose");
require("dotenv").config();

// Mongoose Models
const Info = require("../models/Info");

const add = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    });

    await Info.deleteMany({});

    const info = new Info({
      lastBlock: 11235750,
      totalBurned: 0,
      gasSpent: 0,
      maxBurns: 20,
    });

    await info.save();
    console.log("Info added");

    process.exit(0);
  } catch (error) {
    console.log(error.message);
    process.exit(error);
  }
};

add();
