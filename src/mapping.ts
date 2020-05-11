import { Address, log, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import { SuperRareV2, TokenURIUpdated as TokenURIUpdatedV2Event, Transfer as TransferV2Event } from '../generated/SuperRareV2/SuperRareV2';
import { SetSalePrice as SetSalePriceEvent, Bid as BidEvent, CancelBid as CancelBidEvent, AcceptBid as AcceptBidEvent, Sold as SoldEvent, SetPrimarySaleFeeCall, SetRoyaltyFeeCall } from '../generated/SuperRareMarketAuction/SuperRareMarketAuction';
import { SupeRare, Transfer as TransferV1Event, SalePriceSet as SalePriceSetV1Event, Sold as SoldV1Event, Bid as BidV1Event, CancelBid as CancelBidV1Event, AcceptBid as AcceptBidV1Event } from '../generated/SupeRare/SupeRare';
import { Market, Artwork, Account, Bid, Sale, Transfer } from '../generated/schema';

const BIRTH_ADDRESS: string = '0x0000000000000000000000000000000000000000';
const MARKET_ID: string = '0';
const INITIAL_PRIMARY_MARKET_FRACTION = 85;
const INITIAL_ROYALTY_FEE = 3;
const NEW_ROYALTY_FEE = 10;
const NEW_ROYALTY_FEE_BLOCK_NUMBER = 9781596;

export function handleTokenURIUpdatedV2(event: TokenURIUpdatedV2Event): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);
  if (artwork != null) {
    artwork.uri = event.params._uri;
    artwork.save();
    log.debug("handleTokenURIUpdatedV2(): URI updated - {}, {}", [tokenIdStr, artwork.uri]);
  }
}

export function handleTransferV2(event: TransferV2Event): void {
  _handleTransfer(event.params.tokenId, event.params.from, event.params.to, SuperRareV2.bind(event.address).tokenURI(event.params.tokenId), event.block.timestamp, event.transaction.hash);
}

export function handleTransferV1(event: TransferV1Event): void {
  _handleTransfer(event.params._tokenId, event.params._from, event.params._to, SupeRare.bind(event.address).tokenURI(event.params._tokenId), event.block.timestamp, event.transaction.hash);
}

function _handleTransfer( tokenId: BigInt,
                          fromAddress: Address,
                          toAddress: Address,
                          uri: string,
                          blockTimestamp: BigInt,
                          transactionHash: Bytes): void {
  let tokenIdStr = tokenId.toString();

  if (fromAddress.toHex() == BIRTH_ADDRESS) {
    let artwork = new Artwork(tokenIdStr);
    artwork.tokenId = tokenId;
    artwork.artist = _loadAccount(toAddress);
    artwork.owner = artwork.artist;
    artwork.uri = uri;
    artwork.bids = new Array<string>();
    artwork.sales = new Array<string>();
    artwork.transfers = new Array<string>();
    artwork.status = 'Created';
    artwork.timeCreated = blockTimestamp;
    artwork.save();

    log.debug("_handleTransfer(): Artwork created - {}, {}, {}, {}", [tokenIdStr, artwork.artist, artwork.uri, artwork.timeCreated.toString()]);

  } else {
    let artwork = Artwork.load(tokenIdStr);
    if (artwork != null) {
      if (toAddress.toHex() != BIRTH_ADDRESS) {
        let transfer = new Transfer(transactionHash.toHex());
        transfer.from = _loadAccount(fromAddress);
        transfer.to = _loadAccount(toAddress);
        transfer.timestamp = blockTimestamp;
        transfer.save();

        let transfers = artwork.transfers;
        transfers.push(transfer.id);
        artwork.transfers = transfers;

        artwork.status = 'Sold';
        artwork.owner = _loadAccount(toAddress);
        artwork.timeLastTransferred = transfer.timestamp;

        log.debug("_handleTransfer(): Artwork tranferred - {}, {}, {}", [tokenIdStr, transfer.from, transfer.to]);
      } else {
        artwork.timeWithdrawn = blockTimestamp;
        artwork.status = 'Withdrawn';

        log.debug("_handleTransfer(): Artwork withdrawn - {}, {}", [tokenIdStr, artwork.timeWithdrawn.toString()]);
      }

      artwork.save();
    } else {
      log.error("_handleTransfer(): Artwork not found - {}", [tokenIdStr]);
    }
  }
}

export function handleSetSalePrice(event: SetSalePriceEvent): void {
   _handleSetSalePrice(event.params._tokenId, event.params._amount, event.block.timestamp, event.transaction.hash);
}

export function handleSalePriceSetV1(event: SalePriceSetV1Event): void {
   _handleSetSalePrice(event.params._tokenId, event.params._price, event.block.timestamp, event.transaction.hash);
}

function _handleSetSalePrice( tokenId: BigInt,
                              amount: BigInt,
                              blockTimestamp: BigInt,
                              transactionHash: Bytes): void {
  let tokenIdStr = tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    if (artwork.currentSale != null) {
      let sale = Sale.load(artwork.currentSale);
      if (sale != null) {
        sale.price = amount;
        sale.save();
        log.debug("_handleSetSalePrice(): Set new sale price - {}, {}", [tokenIdStr, sale.price.toString()]);
      } else {
        log.error("_handleSetSalePrice(): Current sale not found - {}", [tokenIdStr]);
      }
    } else {
      let sale = new Sale(transactionHash.toHex());
      sale.seller = artwork.owner;
      sale.price = amount;
      sale.timeRaised = blockTimestamp;
      sale.isSold = false;
      sale.save();

      let sales = artwork.sales;
      sales.push(sale.id);
      artwork.sales = sales;
      artwork.currentSale = sale.id;
      artwork.save();

      log.debug("_handleSetSalePrice(): On sale - {}, {}", [tokenIdStr, sale.price.toString()]);
    }
  } else {
    log.error("_handleSetSalePrice(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleSold(event: SoldEvent): void {
  _handleSold(event.params._tokenId, event.params._buyer, event.params._amount, event.block.timestamp);
}

export function handleSoldV1(event: SoldV1Event): void {
  _handleSold(event.params._tokenId, event.params._buyer, event.params._amount, event.block.timestamp);
}

function _handleSold( tokenId: BigInt,
                      buyer: Address,
                      amount: BigInt,
                      blockTimestamp: BigInt): void {
  let tokenIdStr = tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let sale = Sale.load(artwork.currentSale);
    if (sale != null) {
      sale.isSold = true;
      sale.buyer = _loadAccount(buyer);
      sale.timeSold = blockTimestamp;
      sale.save();
    } else {
      log.error("_handleSold(): Sale not found - {}", [artwork.currentSale]);
    }

    // calculate artist's royalty and primary income, as well as artwork's first transfer price
    let artistAccount = Account.load(artwork.artist);
    if (artistAccount != null) {
      let market = Market.load(_loadMarket());
      if (artwork.firstTransferPrice != null) {
        artistAccount.totalRoyalty = artistAccount.totalRoyalty + (amount * market.royaltyFee / BigInt.fromI32(100));
      } else {
        artwork.firstTransferPrice = amount;
        artistAccount.totalPrimaryIncome = artistAccount.totalPrimaryIncome + (amount * market.primaryIncomeFraction / BigInt.fromI32(100));
      }
      artistAccount.save();
    } else {
      log.error("_handleSold(): Artist not found - {}", [artwork.artist]);
    }

    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = amount;
    artwork.save();

    log.debug("_handleSold(): Artwork sold - {}, {}, {}", [tokenIdStr, buyer.toHex(), artwork.lastTransferPrice.toString()]);
  } else {
    log.error("_handleSold(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleBid(event: BidEvent): void {
  _handleBid(event.params._tokenId, event.params._bidder, event.params._amount, event.block.timestamp, event.transaction.hash);
}

export function handleBidV1(event: BidV1Event): void {
  _handleBid(event.params._tokenId, event.params._bidder, event.params._amount, event.block.timestamp, event.transaction.hash);
}

function _handleBid(tokenId: BigInt,
                    bidder: Address,
                    amount: BigInt,
                    blockTimestamp: BigInt,
                    transactionHash: Bytes): void {
  let tokenIdStr = tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = new Bid(transactionHash.toHex());
    bid.bidder = _loadAccount(bidder);
    bid.price = amount;
    bid.timeRaised = blockTimestamp;
    bid.status = 'Open';
    bid.save();

    let bids = artwork.bids;
    bids.push(bid.id);
    artwork.bids = bids;
    artwork.currentBid = bid.id;
    artwork.save();

    log.debug("_handleBid(): Bid raised - {}, {}, {}", [tokenIdStr, bid.timeRaised.toString(), bid.bidder]);
  } else {
    log.error("_handleBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleCancelBid(event: CancelBidEvent): void {
  _handleCancelBid(event.params._tokenId, event.block.timestamp);
}

export function handleCancelBidV1(event: CancelBidV1Event): void {
  _handleCancelBid(event.params._tokenId, event.block.timestamp);
}

function _handleCancelBid(tokenId: BigInt,
                          blockTimestamp: BigInt): void {
  let tokenIdStr = tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = Bid.load(artwork.currentBid);
    if (bid != null) {
      bid.status = 'Cancelled';
      bid.timeCancelled = blockTimestamp;
      bid.save();

      log.debug("_handleCancelBid(): Bid cancelled: {}", [bid.id]);
    } else {
      log.error("_handleCancelBid(): Cancelled bid not found - {}", [artwork.currentBid]);
    }
  } else {
    log.error("_handleCancelBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleAcceptBid(event: AcceptBidEvent): void {
  _handleAcceptBid(event.params._tokenId, event.params._seller, event.params._amount, event.block.timestamp);
}

export function handleAcceptBidV1(event: AcceptBidV1Event): void {
  _handleAcceptBid(event.params._tokenId, event.params._seller, event.params._amount, event.block.timestamp);
}

function _handleAcceptBid(tokenId: BigInt,
                          seller: Address,
                          amount: BigInt,
                          blockTimestamp: BigInt): void {
  let tokenIdStr = tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = Bid.load(artwork.currentBid);
    if (bid != null) {
      bid.status = 'Accepted';
      bid.acceptedBy = _loadAccount(seller);
      bid.timeAccepted = blockTimestamp;
      bid.save();

      log.debug("_handleAcceptBid(): Bid accepted: {}, {}", [bid.id, bid.acceptedBy]);
    } else {
      log.error("_handleAcceptBid(): Accepted bid not found - {}", [artwork.currentBid]);
    }

    // calculate artist's royalty and primary income, as well as artwork's first transfer price
    let artistAccount = Account.load(artwork.artist);
    if (artistAccount != null) {
      let market = Market.load(_loadMarket());
      if (artwork.firstTransferPrice != null) {
        artistAccount.totalRoyalty = artistAccount.totalRoyalty + (amount * market.royaltyFee / BigInt.fromI32(100));
      } else {
        artwork.firstTransferPrice = amount;
        artistAccount.totalPrimaryIncome = artistAccount.totalPrimaryIncome + (amount * market.primaryIncomeFraction / BigInt.fromI32(100));
      }
      artistAccount.save();
    } else {
      log.error("_handleAcceptBid(): Artist not found - {}", [artwork.artist]);
    }

    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = amount;
    artwork.save();
  } else {
    log.error("_handleAcceptBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

// working function, but notice that currently it's not used due to performance reason of call hanlding in the platform
export function handleSetPrimarySaleFee(call: SetPrimarySaleFeeCall): void {
  let market = Market.load(_loadMarket());
  market.primaryIncomeFraction = BigInt.fromI32(100) - call.inputs._percentage;
  market.save();
  log.debug("handleSetPrimarySaleFee(): Primary income fraction updated - {}", [market.primaryIncomeFraction.toString()]);
}

// working function, but notice that currently it's not used due to performance reason of call hanlding in the platform
export function handleSetRoyaltyFee(call: SetRoyaltyFeeCall): void {
  let market = Market.load(_loadMarket());
  market.royaltyFee = call.inputs._percentage;
  market.save();
  log.debug("handleSetRoyaltyFee(): Royalty fee updated - {}", [market.royaltyFee.toString()]);
}

// working function, but notice that currently it's not used due to performance reason of block handling in the platform
export function handleBlockInMarketAuction(block: ethereum.Block): void {
  if (block.number == BigInt.fromI32(NEW_ROYALTY_FEE_BLOCK_NUMBER)) {
    let market = Market.load(_loadMarket());
    market.royaltyFee = BigInt.fromI32(NEW_ROYALTY_FEE);
    market.save();
    log.debug("handleBlockWithMarketAuction(): Royalty fee updated - {}", [market.royaltyFee.toString()]);
  }
}

function _loadAccount(address: Address): string {
  let accountId = address.toHex();
  let account = Account.load(accountId);

  if (account == null) {
    account = new Account(accountId);
    account.address = address;
    account.totalPrimaryIncome = BigInt.fromI32(0);
    account.totalRoyalty = BigInt.fromI32(0);
    account.save();
  }

  return accountId;
}

function _loadMarket(): string {
  let market = Market.load(MARKET_ID);

  if (market == null) {
    market = new Market(MARKET_ID);
    market.primaryIncomeFraction = BigInt.fromI32(INITIAL_PRIMARY_MARKET_FRACTION);
    market.royaltyFee = BigInt.fromI32(INITIAL_ROYALTY_FEE);
    market.save();
  }

  return MARKET_ID;
}