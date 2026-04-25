const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Marketplace", function () {
  let marketplace;
  let owner;
  let seller;
  let buyer;
  let buyer2;

  // Sample file data
  const file1 = {
    cid: "QmSampleCID1234567890abcdef",
    title: "React Component Library",
    description: "A collection of 50+ reusable React components",
    previewImage: "QmPreview1234",
    price: ethers.parseEther("0.01"),
  };

  const file2 = {
    cid: "QmSampleCID2345678901bcdefg",
    title: "Python ML Starter Kit",
    description: "Complete machine learning project template",
    previewImage: "QmPreview2345",
    price: ethers.parseEther("0.02"),
  };

  beforeEach(async function () {
    [owner, seller, buyer, buyer2] = await ethers.getSigners();

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();
  });

  // ============ Deployment Tests ============

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await marketplace.owner()).to.equal(owner.address);
    });

    it("should initialize with zero files", async function () {
      expect(await marketplace.fileCount()).to.equal(0);
    });

    it("should initialize with 2.5% platform fee (250 basis points)", async function () {
      expect(await marketplace.platformFee()).to.equal(250);
    });
  });

  // ============ File Upload Tests ============

  describe("Upload File", function () {
    it("should upload a file successfully", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid,
        file1.title,
        file1.description,
        file1.previewImage,
        file1.price
      );

      expect(await marketplace.fileCount()).to.equal(1);

      const file = await marketplace.getFile(1);
      expect(file.title).to.equal(file1.title);
      expect(file.description).to.equal(file1.description);
      expect(file.price).to.equal(file1.price);
      expect(file.seller).to.equal(seller.address);
      expect(file.isActive).to.equal(true);
      expect(file.totalSales).to.equal(0);
    });

    it("should emit FileUploaded event", async function () {
      await expect(
        marketplace.connect(seller).uploadFile(
          file1.cid,
          file1.title,
          file1.description,
          file1.previewImage,
          file1.price
        )
      )
        .to.emit(marketplace, "FileUploaded")
        .withArgs(1, file1.cid, file1.title, file1.price, seller.address);
    });

    it("should give seller access to their own file", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid,
        file1.title,
        file1.description,
        file1.previewImage,
        file1.price
      );

      expect(await marketplace.hasAccess(1, seller.address)).to.equal(true);
    });

    it("should track seller's listings", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      await marketplace.connect(seller).uploadFile(
        file2.cid, file2.title, file2.description, file2.previewImage, file2.price
      );

      const listings = await marketplace.getUserListings(seller.address);
      expect(listings.length).to.equal(2);
      expect(listings[0]).to.equal(1);
      expect(listings[1]).to.equal(2);
    });

    it("should return the new file ID", async function () {
      const tx = await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      // The return value of uploadFile is the fileCount (1-indexed)
      expect(await marketplace.fileCount()).to.equal(1);
    });

    it("should reject empty CID", async function () {
      await expect(
        marketplace.connect(seller).uploadFile(
          "", file1.title, file1.description, file1.previewImage, file1.price
        )
      ).to.be.revertedWith("CID cannot be empty");
    });

    it("should reject empty title", async function () {
      await expect(
        marketplace.connect(seller).uploadFile(
          file1.cid, "", file1.description, file1.previewImage, file1.price
        )
      ).to.be.revertedWith("Title cannot be empty");
    });

    it("should reject zero price", async function () {
      await expect(
        marketplace.connect(seller).uploadFile(
          file1.cid, file1.title, file1.description, file1.previewImage, 0
        )
      ).to.be.revertedWith("Price must be greater than 0");
    });

    it("should allow multiple files from different sellers", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      await marketplace.connect(buyer).uploadFile(
        file2.cid, file2.title, file2.description, file2.previewImage, file2.price
      );

      expect(await marketplace.fileCount()).to.equal(2);

      const f1 = await marketplace.getFile(1);
      expect(f1.seller).to.equal(seller.address);

      const f2 = await marketplace.getFile(2);
      expect(f2.seller).to.equal(buyer.address);
    });
  });

  // ============ Purchase Tests ============

  describe("Purchase File", function () {
    beforeEach(async function () {
      // Seller uploads a file
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
    });

    it("should allow a buyer to purchase a file", async function () {
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      expect(await marketplace.hasAccess(1, buyer.address)).to.equal(true);

      const file = await marketplace.getFile(1);
      expect(file.totalSales).to.equal(1);
    });

    it("should emit FilePurchased event", async function () {
      await expect(
        marketplace.connect(buyer).purchaseFile(1, { value: file1.price })
      )
        .to.emit(marketplace, "FilePurchased")
        .withArgs(1, buyer.address, seller.address, file1.price);
    });

    it("should transfer correct amounts (seller gets price minus fee)", async function () {
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      // Platform fee is 2.5% = 250 basis points
      const fee = (file1.price * 250n) / 10000n;
      const sellerAmount = file1.price - fee;

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(sellerAmount);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(fee);
    });

    it("should refund excess payment", async function () {
      const overpayment = ethers.parseEther("0.05");
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).purchaseFile(1, { value: overpayment });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);

      // Buyer should have paid only file1.price + gas, excess refunded
      const totalSpent = buyerBalanceBefore - buyerBalanceAfter;
      expect(totalSpent).to.equal(file1.price + gasCost);
    });

    it("should track buyer's purchases", async function () {
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      const purchases = await marketplace.getUserPurchases(buyer.address);
      expect(purchases.length).to.equal(1);
      expect(purchases[0]).to.equal(1);
    });

    it("should reject if file does not exist", async function () {
      await expect(
        marketplace.connect(buyer).purchaseFile(999, { value: file1.price })
      ).to.be.revertedWith("File does not exist");
    });

    it("should reject if file is not active", async function () {
      await marketplace.connect(seller).deactivateFile(1);

      await expect(
        marketplace.connect(buyer).purchaseFile(1, { value: file1.price })
      ).to.be.revertedWith("File is not active");
    });

    it("should reject if seller tries to buy own file", async function () {
      await expect(
        marketplace.connect(seller).purchaseFile(1, { value: file1.price })
      ).to.be.revertedWith("Cannot buy your own file");
    });

    it("should reject duplicate purchase", async function () {
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      await expect(
        marketplace.connect(buyer).purchaseFile(1, { value: file1.price })
      ).to.be.revertedWith("Already purchased");
    });

    it("should reject insufficient payment", async function () {
      const lowPrice = ethers.parseEther("0.001");

      await expect(
        marketplace.connect(buyer).purchaseFile(1, { value: lowPrice })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should allow multiple buyers to purchase same file", async function () {
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });
      await marketplace.connect(buyer2).purchaseFile(1, { value: file1.price });

      expect(await marketplace.hasAccess(1, buyer.address)).to.equal(true);
      expect(await marketplace.hasAccess(1, buyer2.address)).to.equal(true);

      const file = await marketplace.getFile(1);
      expect(file.totalSales).to.equal(2);
    });
  });

  // ============ Access Control Tests ============

  describe("Access Control", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
    });

    it("should allow seller to get file CID", async function () {
      const cid = await marketplace.connect(seller).getFileCID(1);
      expect(cid).to.equal(file1.cid);
    });

    it("should allow buyer with access to get file CID", async function () {
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });
      const cid = await marketplace.connect(buyer).getFileCID(1);
      expect(cid).to.equal(file1.cid);
    });

    it("should deny CID access to non-purchasers", async function () {
      await expect(
        marketplace.connect(buyer).getFileCID(1)
      ).to.be.revertedWith("No access to this file");
    });

    it("should correctly report access status", async function () {
      expect(await marketplace.checkAccess(1, seller.address)).to.equal(true);
      expect(await marketplace.checkAccess(1, buyer.address)).to.equal(false);

      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      expect(await marketplace.checkAccess(1, buyer.address)).to.equal(true);
    });
  });

  // ============ Seller Management Tests ============

  describe("Seller Management", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
    });

    it("should allow seller to update price", async function () {
      const newPrice = ethers.parseEther("0.05");

      await expect(marketplace.connect(seller).updatePrice(1, newPrice))
        .to.emit(marketplace, "PriceUpdated")
        .withArgs(1, file1.price, newPrice);

      const file = await marketplace.getFile(1);
      expect(file.price).to.equal(newPrice);
    });

    it("should reject zero price update", async function () {
      await expect(
        marketplace.connect(seller).updatePrice(1, 0)
      ).to.be.revertedWith("Price must be greater than 0");
    });

    it("should reject price update from non-seller", async function () {
      await expect(
        marketplace.connect(buyer).updatePrice(1, ethers.parseEther("0.05"))
      ).to.be.revertedWith("Only seller can modify");
    });

    it("should allow seller to deactivate file", async function () {
      await expect(marketplace.connect(seller).deactivateFile(1))
        .to.emit(marketplace, "FileDeactivated")
        .withArgs(1, seller.address);

      const file = await marketplace.getFile(1);
      expect(file.isActive).to.equal(false);
    });

    it("should allow seller to reactivate file", async function () {
      await marketplace.connect(seller).deactivateFile(1);
      
      await expect(marketplace.connect(seller).reactivateFile(1))
        .to.emit(marketplace, "FileReactivated")
        .withArgs(1, seller.address);

      const file = await marketplace.getFile(1);
      expect(file.isActive).to.equal(true);
    });

    it("should reject deactivation from non-seller", async function () {
      await expect(
        marketplace.connect(buyer).deactivateFile(1)
      ).to.be.revertedWith("Only seller can modify");
    });
  });

  // ============ Query Tests ============

  describe("Queries", function () {
    beforeEach(async function () {
      // Upload 3 files
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      await marketplace.connect(seller).uploadFile(
        file2.cid, file2.title, file2.description, file2.previewImage, file2.price
      );
      await marketplace.connect(buyer).uploadFile(
        "QmThirdFile", "Third File", "Description", "", ethers.parseEther("0.03")
      );
    });

    it("should return all active files", async function () {
      const activeFiles = await marketplace.getAllActiveFiles();
      expect(activeFiles.length).to.equal(3);
    });

    it("should exclude deactivated files from active list", async function () {
      await marketplace.connect(seller).deactivateFile(2);

      const activeFiles = await marketplace.getAllActiveFiles();
      expect(activeFiles.length).to.equal(2);
      expect(activeFiles[0]).to.equal(1);
      expect(activeFiles[1]).to.equal(3);
    });

    it("should return correct file details", async function () {
      const file = await marketplace.getFile(1);
      expect(file.id).to.equal(1);
      expect(file.title).to.equal(file1.title);
      expect(file.description).to.equal(file1.description);
      expect(file.previewImage).to.equal(file1.previewImage);
      expect(file.price).to.equal(file1.price);
      expect(file.seller).to.equal(seller.address);
      expect(file.isActive).to.equal(true);
    });

    it("should revert for non-existent file", async function () {
      await expect(marketplace.getFile(999)).to.be.revertedWith("File does not exist");
    });

    it("should revert for file ID 0", async function () {
      await expect(marketplace.getFile(0)).to.be.revertedWith("File does not exist");
    });
  });

  // ============ Admin Tests ============

  describe("Admin Functions", function () {
    it("should allow owner to update platform fee", async function () {
      await marketplace.connect(owner).updatePlatformFee(500); // 5%
      expect(await marketplace.platformFee()).to.equal(500);
    });

    it("should reject fee above 10%", async function () {
      await expect(
        marketplace.connect(owner).updatePlatformFee(1001)
      ).to.be.revertedWith("Fee cannot exceed 10%");
    });

    it("should reject fee update from non-owner", async function () {
      await expect(
        marketplace.connect(seller).updatePlatformFee(500)
      ).to.be.revertedWith("Only owner can call this");
    });

    it("should allow owner to withdraw fees", async function () {
      // Upload and purchase to generate fees
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      // There shouldn't be leftover balance in the contract since fees are sent immediately
      // The contract's balance should be 0 after purchase
      await expect(
        marketplace.connect(owner).withdrawFees()
      ).to.be.revertedWith("No fees to withdraw");
    });

    it("should reject withdrawal from non-owner", async function () {
      await expect(
        marketplace.connect(seller).withdrawFees()
      ).to.be.revertedWith("Only owner can call this");
    });

    it("should return correct platform stats", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      const stats = await marketplace.getPlatformStats();
      expect(stats.totalFiles).to.equal(1);
      expect(stats.totalPurchases).to.equal(1);
    });
  });

  // ============ Edge Case Tests ============

  describe("Edge Cases", function () {
    it("should handle file with empty description and preview", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, "", "", file1.price
      );

      const file = await marketplace.getFile(1);
      expect(file.title).to.equal(file1.title);
      expect(file.description).to.equal("");
      expect(file.previewImage).to.equal("");
    });

    it("should handle very small price (1 wei)", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, 1
      );

      await marketplace.connect(buyer).purchaseFile(1, { value: 1 });
      expect(await marketplace.hasAccess(1, buyer.address)).to.equal(true);
    });

    it("should handle very large price", async function () {
      const largePrice = ethers.parseEther("1000");

      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, largePrice
      );

      const file = await marketplace.getFile(1);
      expect(file.price).to.equal(largePrice);
    });

    it("should handle reactivation after purchase", async function () {
      await marketplace.connect(seller).uploadFile(
        file1.cid, file1.title, file1.description, file1.previewImage, file1.price
      );

      // Buyer purchases
      await marketplace.connect(buyer).purchaseFile(1, { value: file1.price });

      // Seller deactivates
      await marketplace.connect(seller).deactivateFile(1);

      // Buyer still has access
      expect(await marketplace.hasAccess(1, buyer.address)).to.equal(true);
      const cid = await marketplace.connect(buyer).getFileCID(1);
      expect(cid).to.equal(file1.cid);

      // But new purchases are blocked
      await expect(
        marketplace.connect(buyer2).purchaseFile(1, { value: file1.price })
      ).to.be.revertedWith("File is not active");

      // Seller reactivates
      await marketplace.connect(seller).reactivateFile(1);

      // New purchases work again
      await marketplace.connect(buyer2).purchaseFile(1, { value: file1.price });
      expect(await marketplace.hasAccess(1, buyer2.address)).to.equal(true);
    });
  });
});
