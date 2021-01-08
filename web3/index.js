const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");

const provider = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`
);

// web3 Instances
const web3 = new Web3(provider);
const web3Ws = new Web3(
  `wss://rinkeby.infura.io/ws/v3/${process.env.INFURA_KEY}`
);

const erc20Abi = require("./erc20Abi");
const forgeAbi = require("./forgeAbi");

// Constants
const ZUT_ADDRESS = "0xc0171836BA0036AD0DD24697E22BF3d2d45B45aE";
const FORGE_ADDRESS = "0x4359C08b706B6BD92E2991d7cD143C5894d1a02f";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Contract Instances
const zut = new web3Ws.eth.Contract(erc20Abi, ZUT_ADDRESS);
const forge = new web3Ws.eth.Contract(forgeAbi, FORGE_ADDRESS);

// Mongoose Models
const Token = require("../models/Token");

module.exports = () => {
  forge.events
    .TransferSingle()
    .on("data", async ({ returnValues }) => {
      console.log("\nNew TransferSingle Event!");
      const existingToken = await Token.findOne({
        tokenId: returnValues.id,
      });

      // Newly minted tokens
      if (!existingToken && returnValues.from == ZERO_ADDRESS) {
        console.log(
          `New NFT collection! Creator: ${returnValues.to} Id: ${returnValues.id}`
        );
        const newToken = new Token({
          tokenId: returnValues.id,
          creator: returnValues.to,
          amount: returnValues.value,
        });
        await newToken.save();
      }
      // Token Transfer to User
      else if (existingToken && returnValues.from !== ZERO_ADDRESS) {
        console.log(
          `NFT Transferred! User: ${returnValues.to} Id: ${returnValues.id}`
        );
        existingToken.holders.push(returnValues.to);
        await existingToken.save();
      }
    })
    .on("error", console.error);
};
