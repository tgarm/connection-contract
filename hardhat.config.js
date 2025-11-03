// hardhat.config.js (Hardhat 2.x CJS)

require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
// 注意：ABI 复制任务现在是独立的 Node.js 脚本，无需在此导入

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Hardhat 2.x 的默认本地网络配置
    hardhat: {
      // 默认配置即可，无需复杂的 edr-simulated
    },
  },
};
