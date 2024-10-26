// 1. Import packages
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const solc = require('solc');

// 2. Get path and load contract
const source = fs.readFileSync('SetMessage.sol', 'utf8');

// 3. Create input object
const input = {
  language: 'Solidity',
  sources: {
    'SetMessage.sol': {
      content: source,
    },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*'],
      },
    },
  },
};

const tempFile = JSON.parse(solc.compile(JSON.stringify(input)));
const contractFile = tempFile.contracts['SetMessage.sol']['SetMessage'];

// 5. Export contract data
module.exports = contractFile;
