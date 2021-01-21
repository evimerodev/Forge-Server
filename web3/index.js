const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");
const { gasStation } = require("../axios");
require("colors");
const CronJob = require("cron").CronJob;
const { fromWei } = require("./utils");

let web3, web3Ws;

let ZUT_ADDRESS, FORGE_ADDRESS, ADMIN_ADDRESS;

console.log(`Server running in ${process.env.NODE_ENV} mode`);
if (process.env.NODE_ENV === "production") {
  const provider = new HDWalletProvider(
    process.env.PRIVATE_KEY,
    `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`
  );

  // web3 Instances
  web3 = new Web3(provider);
  web3Ws = new Web3(`wss://rinkeby.infura.io/ws/v3/${process.env.INFURA_KEY}`);

  ZUT_ADDRESS = "0x487D429BF793D855B7680388d4451dF726157C18";
  FORGE_ADDRESS = "0xC9844e4264C9785012A4a0f5ee8eE7F789D2D7B7";
  ADMIN_ADDRESS = "0xd750bCe912F6074178D68B6014bc003764201803";
} else {
  // web3 Instances
  web3 = new Web3("http://localhost:8545");
  web3Ws = new Web3(`ws://localhost:8545`);

  ZUT_ADDRESS = "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";
  FORGE_ADDRESS = "0xe982E462b094850F12AF94d21D470e21bE9D0E9C";
  ADMIN_ADDRESS = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
}

const erc20Abi = require("./erc20Abi");
const forgeAbi = require("./forgeAbi");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Contract Instances
const zut = new web3Ws.eth.Contract(erc20Abi, ZUT_ADDRESS);
const forge = new web3Ws.eth.Contract(forgeAbi, FORGE_ADDRESS);
const forgeContract = new web3.eth.Contract(forgeAbi, FORGE_ADDRESS);

// Mongoose Models
const Token = require("../models/Token");
const Burn = require("../models/Burn");

// Helper function to add tokens to burn list
const addToBurnList = async (tokenId, user, reason) => {
  const existingBurn = await Burn.findOne({
    tokenId,
    user,
  });

  if (!existingBurn) {
    console.log("Adding token to burn list", tokenId, user, reason);
    const newBurn = new Burn({
      tokenId,
      user,
      reason,
    });
    await newBurn.save();
  }
};

// Function executed by cronjob
const checkForBurns = async () => {
  const currenTime = Math.floor(Date.now() / 1000);

  const tokensToBurn = await Burn.find();
  const tokensExpired = await Token.find({
    expirationTime: { $lte: currenTime, $gt: 0 },
  });

  const burnIds = tokensToBurn.map((t) => t.tokenId);
  const burnAddresses = tokensToBurn.map((t) => t.user);

  // Add Expired Tokens to burn list
  for (let i in tokensExpired) {
    const token = tokensExpired[i];

    if (token.holders.length > 0) {
      console.log(
        `\nToken Expired! Id:${token.tokenId} ${new Date().toLocaleString()}\n`
          .yellow
      );
      token.holders.forEach((holder) => {
        burnIds.push(token.tokenId);
        burnAddresses.push(holder);
      });
    }
  }

  if (burnIds.length > 0) {
    console.log("Amount of tokens to Burn:", burnIds.length);

    // Fetch fast gas price
    const gasData = await gasStation.get();
    const fastGasPrice = gasData.data.fast / 10;

    // Execute burn in batch transaction
    const { gasUsed } = await forgeContract.methods
      .burnTokenBatch(burnIds, burnAddresses)
      .send({ from: ADMIN_ADDRESS, gasPrice: fastGasPrice * 1e9 });

    console.log(
      `Burn Batch Tx Executed! Gas Used: ${gasUsed} wei. Gas Price: ${fastGasPrice} gwei`
        .gray.inverse
    );

    // If success, empty burn collection in DB
    await Burn.deleteMany();

    // If success, delete expired tokens in DB
    await Token.deleteMany({ expirationTime: { $lte: currenTime, $gt: 0 } });
  }
};

module.exports = () => {
  var job = new CronJob(
    "0 */30 * * * *", // every 30 mins
    // "*/30 * * * * *", // every 30 sec
    checkForBurns,
    null,
    true,
    "America/Los_Angeles"
  );
  job.start();
  console.log("Cronjob started!");

  // Listen to Forge Transfer events
  forge.events
    .TransferSingle()
    .on("data", async ({ returnValues }) => {
      // console.log("New Forge Transfer Event!");
      const tokenId = returnValues.id;

      const existingToken = await Token.findOne({
        tokenId,
      });

      // Newly minted tokens
      if (
        !existingToken &&
        returnValues.from == ZERO_ADDRESS &&
        returnValues.to !== ZERO_ADDRESS
      ) {
        console.log(
          `\n New NFT collection! Creator: ${returnValues.to} Id: ${tokenId} Amount:${returnValues.value} \n`
            .green.inverse
        );

        const expiration = await forge.methods.expirations(tokenId).call();
        const amount = await forge.methods.minBalances(tokenId).call();
        const tokenAddress = await forge.methods
          .tokenMinBalances(tokenId)
          .call();

        const newToken = new Token({
          tokenId,
          creator: returnValues.to,
          amount: returnValues.value,
          expirationTime: Number(expiration),
          minBalance: {
            tokenAddress,
            amount,
          },
        });
        await newToken.save();
      }
      // Token Transfer to User
      else if (
        existingToken &&
        returnValues.from !== ZERO_ADDRESS &&
        returnValues.to !== ZERO_ADDRESS
      ) {
        console.log(
          `NFT Transferred! User: ${returnValues.to} Id: ${returnValues.id} `
        );

        const canBurn = await forge.methods
          .canBurn(tokenId, returnValues.to)
          .call();
        if (canBurn) {
          await addToBurnList(tokenId, returnValues.to, "Min Balance");
        } else {
          // add holder if was not burned
          existingToken.holders.push(returnValues.to);
          await existingToken.save();
        }
      } else if (returnValues.to === ZERO_ADDRESS) {
        console.log(
          `\n Token Burned Id:${tokenId} User:${returnValues.from} \n`.red
            .inverse
        );
      }
    })
    .on("error", console.error);

  // Listen to ZUT Transfer events
  zut.events
    .Transfer()
    .on("data", async ({ returnValues }) => {
      console.log("\nNew ZUT Transfer Event!");

      // Find tokens that user "from" is involved with
      const tokens = await Token.find({
        holders: { $all: [returnValues.from.toLowerCase()] },
      });

      // Newly minted tokens
      if (tokens.length > 0) {
        for (let i in tokens) {
          const token = tokens[i];
          if (
            token.minBalance.tokenAddress.toLowerCase() ==
            ZUT_ADDRESS.toLowerCase()
          ) {
            const canBurn = await forge.methods
              .canBurn(tokenId, returnValues.from)
              .call();

            if (canBurn) {
              await addToBurnList(
                token.tokenId,
                returnValues.from,
                "Min Balance"
              );

              // Remove user from token holders, as its already on burn list
              token.holders = token.holders.filter(
                (holder) => holder != returnValues.from.toLowerCase()
              );
              await token.save();
            }
          }
        }
      }
    })
    .on("error", console.error);
};
