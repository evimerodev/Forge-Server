const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");

const provider = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`
);

const providerWs = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `wss://rinkeby.infura.io/ws/v3/${process.env.INFURA_KEY}`
);

exports.web3 = new Web3(provider);
exports.web3Ws = new Web3(providerWs);
