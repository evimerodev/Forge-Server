const Web3 = require("web3");
const web3 = new Web3();

exports.fromWei = (value) => Number(web3.utils.fromWei(String(value)));
exports.toWei = (value) => String(web3.utils.toWei(String(value)));
