// scripts/deploy.js
const fs = require('fs');
const path = require('path');
const hre = require("hardhat");
require('dotenv').config();

const FEE_RECEIVER = process.env.FEE_RECEIVER?.trim();
const BASE_SCAN_API_KEY = process.env.BASE_SCAN_API_KEY?.trim();

/** * 辅助函数：更新前端的 JSON 配置文件 */
function updateContractConfig(filePath, networkName, registryAddress, tokenAddress) {
    let config = {};
    if (fs.existsSync(filePath)) {
        try {
            config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.warn("Could not parse existing contracts.json, starting fresh.");
        }
    }

    config.defaultNetwork = networkName;
    config.networks = config.networks || {};
    config.networks[networkName] = {
        registryAddress,
        ctTokenAddress: tokenAddress
    };

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    console.log(`Updated contract addresses for ${networkName} in ${filePath}`);
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log(`部署到 ${hre.network.name} 的账户: ${deployer.address}`);

    const initialSupply = hre.ethers.utils.parseEther("2000000.0");
    const REG_FEE = hre.ethers.utils.parseEther("0.01");
    const MOD_FEE = hre.ethers.utils.parseEther("0.005");
    const DEFAULT_COMMENT_FEE = hre.ethers.utils.parseEther("0.001");

    // --- 1. 部署 CT ---
    const CT = await hre.ethers.getContractFactory("ConnectionToken");
    const ctToken = await CT.deploy(initialSupply);
    await ctToken.deployed();
    console.log("CT 已部署到:", ctToken.address);

    // --- 2. 部署 Registry ---
    const Registry = await hre.ethers.getContractFactory("ConnectionUserRegistry");
    const registry = await Registry.deploy(ctToken.address, REG_FEE, MOD_FEE, DEFAULT_COMMENT_FEE);
    await registry.deployed();
    console.log("Registry 已部署到:", registry.address);

    // --- 3. 初始化空投 ---
    const totalAirdropAmount = hre.ethers.utils.parseEther("1000000.0");
    const txtrans = await ctToken.transfer(registry.address, totalAirdropAmount);
    await txtrans.wait();
    const bal = await ctToken.balanceOf(registry.address);
    if (bal < totalAirdropAmount) {
        throw new Error(`Registry 余额不足！需要 ${hre.ethers.formatEther(totalAirdropAmount)} CT，实际只有 ${hre.ethers.formatEther(bal)}`);
    }
    // Start both airdrop cycles
    await (await registry.startNewAirdropCycle(0, totalAirdropAmount)).wait(); // User Pool
    console.log("User airdrop cycle started");
    await (await registry.startNewAirdropCycle(1, totalAirdropAmount)).wait(); // Content Pool
    console.log("Content airdrop cycle started");

    // 4. 可选：设置 FeeReceiver
    if (FEE_RECEIVER && ethers.utils.isAddress(FEE_RECEIVER)) {
        await (await registry.setFeeReceiver(FEE_RECEIVER)).wait();
        console.log(`FeeReceiver set to ${FEE_RECEIVER}`);
    }
    
    // --- 5. 更新前端 JSON 配置文件 ---
    const frontEndConfigPath = path.join(__dirname, '..', 'demo-web', 'src', 'config', 'contracts.json');
    updateContractConfig(frontEndConfigPath, hre.network.name, registry.address, ctToken.address);

    // --- 6. 复制 ABI ---
    const abiPath = path.join(__dirname, '..', 'demo-web', 'src', 'config', 'abi', 'ConnectionUserRegistry.json');
    const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'ConnectionUserRegistry.sol', 'ConnectionUserRegistry.json');
    fs.mkdirSync(path.dirname(abiPath), { recursive: true });
    if (fs.existsSync(artifactPath)) {
        fs.copyFileSync(artifactPath, abiPath);
        console.log(`ABI 已复制`);
    }

    // --- 7. 验证 ---
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        if(hre.network.name === "baseSepolia" && BASE_SCAN_API_KEY != undefined){
            console.log(`等待 30 秒验证 ${hre.network.name}...`);
            await new Promise(r => setTimeout(r, 30000));
            try {
                await hre.run("verify:verify", {
                    address: ctToken.address,
                    constructorArguments: [initialSupply],
                });
                console.log("✅ CT 验证成功");

                await hre.run("verify:verify", {
                    address: registry.address,
                    constructorArguments: [ctToken.address, REG_FEE, MOD_FEE, DEFAULT_COMMENT_FEE],
                });
                console.log("✅ Registry 验证成功");
            } catch (e) {
                if (e.message.includes("Already Verified")) {
                    console.log("ℹ️  合约已验证过，跳过");
                } else {
                    console.warn("⚠️  验证失败（可忽略）：", e.message);
                }
            }
        }else{
            console.log('No required API Key, skip verification');
        }
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });