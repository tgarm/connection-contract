// test/Registry.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ConnectionUserRegistry", function () {
    
    const ONE_DAY = 86400;

    // 部署并初始化合约的夹具 (Fixture)
    async function deployRegistryFixture() {
        const [owner, user1, user2] = await ethers.getSigners();

        const initialSupply = ethers.utils.parseEther("1000000"); 
        const CTFactory = await ethers.getContractFactory("ConnectionToken");
        const ctToken = await CTFactory.deploy(initialSupply);
        await ctToken.deployed(); 
        const ctAddress = ctToken.address;

        const REG_FEE = ethers.utils.parseEther("0.01"); 
        const MOD_FEE = ethers.utils.parseEther("0.005"); 
        const AIRDROP_RATIO = 100; // 仍需传入合约
        const AIRDROP_AMOUNT = ethers.utils.parseEther("10000"); 
        // 🚨 在测试中定义常量，匹配合约
        const AIRDROP_CYCLE_DURATION = 126144000; 

        const RegistryFactory = await ethers.getContractFactory("ConnectionUserRegistry");
        const registry = await RegistryFactory.deploy(
            ctAddress, REG_FEE, MOD_FEE, AIRDROP_RATIO
        );
        await registry.deployed();
        
        await ctToken.transfer(registry.address, AIRDROP_AMOUNT);
        await registry.startNewAirdropCycle(AIRDROP_AMOUNT, AIRDROP_RATIO);
        
        // 🚨 返回起始时间戳
        const lastAirdropTimestamp = await registry.lastAirdropTimestamp();

        return { 
            ctToken, registry, owner, user1, user2, REG_FEE, AIRDROP_AMOUNT, 
            lastAirdropTimestamp, AIRDROP_CYCLE_DURATION 
        };
    }

    describe("User Registration and Airdrop", function () {
        
        it("Should register a user and distribute the correct airdrop amount", async function () {
            const { ctToken, registry, user1, REG_FEE, AIRDROP_AMOUNT, lastAirdropTimestamp, AIRDROP_CYCLE_DURATION } = await loadFixture(deployRegistryFixture);

            const username = "alice_connect";
            const currentCTBalance = await ctToken.balanceOf(user1.address); // 初始为 0

            // 🚨 关键修正 1：推进时间 30 天
            const THIRTY_DAYS = 30 * ONE_DAY;
            await time.increase(THIRTY_DAYS);
            
            // 获取 Hardhat 模拟的交易时间戳
            // 🚨 我们使用 time.latest() 来预测交易时间戳，这在 Hardhat 中非常接近实际
            const transactionTimestamp = ethers.BigNumber.from(await time.latest());
            
            // 使用 ethers.getContractAt 连接到 user1
            const user1Registry = await ethers.getContractAt(
                "ConnectionUserRegistry", 
                registry.address, 
                user1 
            ); 

            // 注册用户 (触发空投)
            const tx = await user1Registry.registerUsername(username, { value: REG_FEE });
            const receipt = await tx.wait();
            
            // 🚨 获取实际交易发生的时间戳 (更精确的 time source)
            const txBlockTimestamp = ethers.BigNumber.from(receipt.blockNumber ? (await ethers.provider.getBlock(receipt.blockNumber)).timestamp : transactionTimestamp);
            
            // 🚨 关键修正 2：精确复制合约的计算逻辑 (简化版)
            
            // a. 计算时间流逝 
            const timeElapsed = txBlockTimestamp.sub(lastAirdropTimestamp);
            
            // b. 计算总释放量 totalCTToRelease = timeElapsed * currentCycleTotalAirdropAmount / AIRDROP_CYCLE_DURATION
            const AIRDROP_CYCLE_DURATION_BN = ethers.BigNumber.from(AIRDROP_CYCLE_DURATION);
            
            // totalCTToRelease 是本次空投的总量 (因为我们简化了逻辑，不再有比例)
            const expectedAirdrop = timeElapsed.mul(AIRDROP_AMOUNT).div(AIRDROP_CYCLE_DURATION_BN);
            
            // 验证最终余额
            const finalCTBalance = await ctToken.balanceOf(user1.address);
            
            // 检查计算值和实际值是否一致
            expect(finalCTBalance.toString()).to.equal(currentCTBalance.add(expectedAirdrop).toString(), "Airdrop amount mismatch based on time.");
        });

        it("Should revert if registration fee is incorrect", async function () {
            const { registry, user2, REG_FEE } = await loadFixture(deployRegistryFixture);
            
            const incorrectFee = ethers.utils.parseEther("0.001"); 

            const user2Registry = await ethers.getContractAt(
                "ConnectionUserRegistry", 
                registry.address, 
                user2
            );

            await expect(user2Registry.registerUsername("bob_lowfee", { value: incorrectFee }))
                .to.be.revertedWith("Insufficient registration fee"); 
        });
    });
});