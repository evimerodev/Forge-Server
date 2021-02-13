const CronJob = require("cron").CronJob;
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");
const { gasStation } = require("../axios");
require("colors");

let web3;
let ZUT_ADDRESS, FORGE_ADDRESS;
const ADMIN_ADDRESS = "0x5336fC5d057d422c8b7B51CD50285fce0b81196D";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

console.log(`Server running in ${process.env.NODE_ENV} mode`);
if (process.env.NODE_ENV === "production") {
  // web3 Instances
  const provider = new HDWalletProvider(
    process.env.MATIC_PRIVATE_KEY,
    "https://rpc-mainnet.maticvigil.com/"
  );
  web3 = new Web3(provider);

  ZUT_ADDRESS = "0x487D429BF793D855B7680388d4451dF726157C18";
  FORGE_ADDRESS = "0xC9844e4264C9785012A4a0f5ee8eE7F789D2D7B7";
} else {
  // web3 Instances
  const provider = new HDWalletProvider(
    process.env.MATIC_PRIVATE_KEY,
    "https://rpc-mumbai.matic.today"
  );
  web3 = new Web3(provider);

  ZUT_ADDRESS = "0x2bAb96D1D3Fafcd5185d69a53D24925fc8163E40";
  FORGE_ADDRESS = "0xA3d85039287FcC632e060EDFc82B422Cd5cDe99f";
}

const erc20Abi = require("./erc20Abi");
const forgeAbi = require("./forgeAbi");

// Contract Instances
const zut = new web3.eth.Contract(erc20Abi, ZUT_ADDRESS);
const forge = new web3.eth.Contract(forgeAbi, FORGE_ADDRESS);

// Mongoose Models
const Token = require("../models/Token");
const Burn = require("../models/Burn");
const Info = require("../models/Info");

// Function executed by cronjob
const checkForBurns = async () => {
  try {
    const infos = await Info.find();
    if (infos && infos.length > 0) {
      const info = infos[0];
      const toBlock = await web3.eth.getBlockNumber();
      const currenTime = Math.floor(Date.now() / 1000);

      const tokensToBurn = await Burn.find();
      const burnIds = tokensToBurn.map((t) => t.tokenId);
      const burnAddresses = tokensToBurn.map((t) => t.user);

      // FORGE TRANSFER EVENTS
      const forgeEvents = await forge.getPastEvents("TransferSingle", {
        fromBlock: info.lastBlock,
        toBlock,
      });

      for (let i = 0; i < forgeEvents.length; i++) {
        const { returnValues } = forgeEvents[i];
        const tokenId = returnValues.id;

        // Newly minted tokens
        if (
          returnValues.from == ZERO_ADDRESS &&
          returnValues.to !== ZERO_ADDRESS
        ) {
          console.log(
            `\n New NFT collection! Creator: ${returnValues.to} Id: ${tokenId} Amount:${returnValues.value} \n`
              .green.inverse
          );

          const existingToken = await Token.findOne({
            tokenId,
          });

          if (existingToken) continue;

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
        // Token Transfers to User
        else if (
          returnValues.from !== ZERO_ADDRESS &&
          returnValues.to !== ZERO_ADDRESS
        ) {
          const existingToken = await Token.findOne({
            tokenId,
          });

          if (!existingToken) continue;

          console.log(
            `NFT Transferred! User: ${returnValues.to} Id: ${returnValues.id} `
          );

          const canBurn = await forge.methods
            .canBurn(tokenId, returnValues.to)
            .call();
          if (canBurn) {
            burnIds.push(tokenId);
            burnAddresses.push(returnValues.to);
            // await addToBurnList(tokenId, returnValues.to, "Min Balance");
          } else {
            // add holder if was not burned
            existingToken.holders.push(returnValues.to);
            await existingToken.save();
          }
        } else if (returnValues.to === ZERO_ADDRESS) {
          console.log(
            `\n Token Burned Id: ${tokenId} User: ${returnValues.from} \n`.red
              .inverse
          );
        }
      }

      // ZUT TRANSFER EVENTS
      const zutEvents = await zut.getPastEvents("Transfer", {
        fromBlock: info.lastBlock,
        toBlock,
      });

      for (let i = 0; i < zutEvents.length; i++) {
        const { returnValues } = zutEvents[i];

        // Find tokens that user "from" is involved with
        const tokens = await Token.find({
          holders: { $all: [returnValues.from.toLowerCase()] },
        });

        // Newly minted tokens
        if (tokens.length > 0) {
          for (let i in tokens) {
            const token = tokens[i];
            if (
              token.minBalance &&
              token.minBalance.tokenAddress &&
              token.minBalance.tokenAddress.toLowerCase() ==
                ZUT_ADDRESS.toLowerCase()
            ) {
              const canBurn = await forge.methods
                .canBurn(tokenId, returnValues.from)
                .call();

              if (canBurn) {
                // await addToBurnList(
                //   token.tokenId,
                //   returnValues.from,
                //   "Min Balance"
                // );

                burnIds.push(token.tokenId);
                burnAddresses.push(returnValues.from);

                // Remove user from token holders, as its already on burn list
                token.holders = token.holders.filter(
                  (holder) => holder != returnValues.from.toLowerCase()
                );
                await token.save();
              }
            }
          }
        }
      }

      // const tokensToBurn = await Burn.find();
      const tokensExpired = await Token.find({
        expirationTime: { $lte: currenTime, $gt: 0 },
      });

      // Add Expired Tokens to burn list
      for (let i in tokensExpired) {
        const token = tokensExpired[i];

        if (token.holders && token.holders.length > 0) {
          console.log(
            `\nToken Expired! Id:${
              token.tokenId
            } ${new Date().toLocaleString()}\n`.yellow
          );
          token.holders.forEach((holder) => {
            burnIds.push(token.tokenId);
            burnAddresses.push(holder);
          });
        }
      }

      // Burn tokens!!
      if (burnIds.length > 0) {
        // If too many tokens for burning, leave some for later
        if (burnIds.length > info.maxBurns) {
          burnIds = burnIds.slice(0, info.maxBurns);
          burnAddresses = burnAddresses.slice(0, info.maxBurns);
        }

        console.log("Amount of tokens to Burn:", burnIds.length);

        // Fetch fast gas price
        const gasData = await gasStation.get();
        if (gasData && gasData.data) {
          const fastGasPrice = gasData.data.fast / 10;

          // Execute burn in batch transaction
          const { gasUsed } = await forge.methods
            .burnTokenBatch(burnIds, burnAddresses)
            .send({ from: ADMIN_ADDRESS, gasPrice: fastGasPrice * 1e9 });

          info.ethSpent += (Number(gasUsed) * fastGasPrice) / 1e9;
        }
        info.totalBurned += burnIds.length;

        console.log(
          `Burn Batch Tx Executed! Gas Used: ${gasUsed} wei. Gas Price: ${fastGasPrice} gwei`
            .gray.inverse
        );

        // If success, delete only tokens burned that expired
        await Token.deleteMany({
          tokenId: { $in: burnIds },
          expirationTime: { $lte: currenTime, $gt: 0 },
        });
        await Burn.deleteMany({ tokenId: { $in: burnIds } });
      }

      // update block number for next job
      info.lastBlock = toBlock + 1;
      await info.save();
    } else {
      console.log(`\n No document present in info collection. \n`.red.inverse);
    }
  } catch (error) {
    console.log(error);
    //don't exit on error. It will stop cron job
    //process.exit(1);
  }
};

module.exports = () => {
  var job = new CronJob(
    `0 */${process.env.CRON_INTERVAL} * * * *`, // every INTERVAL minutes
    checkForBurns,
    null,
    true,
    "America/Los_Angeles"
  );
  job.start();
  console.log("Cronjob started!");
};
