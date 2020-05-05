import { Address, log } from '@graphprotocol/graph-ts';
import { SuperRareV2, TokenURIUpdated, Transfer as TransferEvent } from '../generated/SuperRareV2/SuperRareV2';
import { SetSalePrice, Bid as BidEvent, CancelBid, AcceptBid, Sold } from '../generated/SuperRareMarketAuction/SuperRareMarketAuction';
import { Artwork, Account, Bid, Sale, Transfer } from '../generated/schema';

const BIRTH_ADDRESS = '0x0000000000000000000000000000000000000000';

export function handleTokenURIUpdated(event: TokenURIUpdated): void {
  let tokenId = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenId);
  if (artwork != null) {
    artwork.uri = event.params._uri;
    artwork.save();
    log.debug("URI updated: {}, {}", [tokenId, artwork.uri]);
  }
}

export function handleTransfer(event: TransferEvent): void {
  let tokenIdStr = event.params.tokenId.toString();

  if (event.params.from.toHex() == BIRTH_ADDRESS) {
    let artwork = new Artwork(tokenIdStr);
    artwork.tokenId = event.params.tokenId;
    artwork.artist = _loadAccount(event.params.to);
    artwork.owner = artwork.artist;
    artwork.uri = SuperRareV2.bind(event.address).tokenURI(event.params.tokenId);
    artwork.bids = new Array<string>();
    artwork.sales = new Array<string>();
    artwork.transfers = new Array<string>();
    artwork.status = 'Created';
    artwork.timeCreated = event.block.timestamp;
    artwork.save();

    log.debug("handleTransfer(): Artwork created - {}, {}, {}, {}", [tokenIdStr, artwork.artist, artwork.uri, artwork.timeCreated.toString()]);

  } else {
    let artwork = Artwork.load(tokenIdStr);
    if (artwork != null) {
      if (event.params.to.toHex() != BIRTH_ADDRESS) {
        let transfer = new Transfer(event.transaction.hash.toHex());
        transfer.from = _loadAccount(event.params.from);
        transfer.to = _loadAccount(event.params.to);
        transfer.timestamp = event.block.timestamp;
        transfer.save();

        let transfers = artwork.transfers;
        transfers.push(transfer.id);
        artwork.transfers = transfers;

        artwork.status = 'Sold';
        artwork.owner = _loadAccount(event.params.to);
        artwork.timeLastTransferred = transfer.timestamp;

        log.debug("handleTransfer(): Artwork tranferred - {}, {}, {}", [tokenIdStr, transfer.from, transfer.to]);
      } else {
        artwork.timeWithdrawn = event.block.timestamp;
        artwork.status = 'Withdrawn';

        log.debug("handleTransfer(): Artwork withdrawn - {}, {}", [tokenIdStr, artwork.timeWithdrawn.toString()]);
      }

      artwork.save();
    } else {
      log.error("handleTransfer(): Artwork not found - {}", [tokenIdStr]);
    }
  }
}

export function handleSetSalePrice(event: SetSalePrice): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    if (artwork.currentSale != null) {
      let sale = Sale.load(artwork.currentSale);
      if (sale != null) {
        sale.price = event.params._amount;
        sale.save();
        log.debug("handleSetSalePrice(): Set new sale price - {}, {}", [tokenIdStr, sale.price.toString()]);
      } else {
        log.error("handleSetSalePrice(): Current sale not found - {}", [tokenIdStr]);
      }
    } else {
      let sale = new Sale(event.transaction.hash.toHex());
      sale.seller = artwork.owner;
      sale.price = event.params._amount;
      sale.timeRaised = event.block.timestamp;
      sale.isSold = false;
      sale.save();

      //artwork.status = (artwork.status == 'Created') ? 'OnPrimarySale' : 'OnSecondarySale';
      let sales = artwork.sales;
      sales.push(sale.id);
      artwork.sales = sales;
      artwork.currentSale = sale.id;
      artwork.save();

      log.debug("handleSetSalePrice(): On sale - {}, {}", [tokenIdStr, sale.price.toString()]);
    }
  } else {
    log.error("handleSetSalePrice(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleSold(event: Sold): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let sale = Sale.load(artwork.currentSale);
    if (sale != null) {
      sale.isSold = true;
      sale.buyer = _loadAccount(event.params._buyer);
      sale.timeSold = event.block.timestamp;
      sale.save();
    } else {
      log.error("handleSold(): Sale not found - {}", [artwork.currentSale]);
    }

    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = event.params._amount;
    artwork.save();

    log.debug("handleSold(): Artwork sold - {}, {}, {}", [tokenIdStr, event.params._buyer.toHex(), artwork.lastTransferPrice.toString()]);
  } else {
    log.error("handleSold(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleBid(event: BidEvent): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = new Bid(event.transaction.hash.toHex());
    bid.bidder = _loadAccount(event.params._bidder);
    bid.price = event.params._amount;
    bid.timeRaised = event.block.timestamp;
    bid.status = 'Open';
    bid.save();

    let bids = artwork.bids;
    bids.push(bid.id);
    artwork.bids = bids;
    artwork.currentBid = bid.id;
    artwork.save();

    log.debug("handlBid(): Bid raised - {}, {}, {}", [tokenIdStr, event.block.timestamp.toString(), event.params._bidder.toHex()]);
  } else {
    log.error("handlBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleCancelBid(event: CancelBid): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = Bid.load(artwork.currentBid);
    if (bid != null) {
      bid.status = 'Cancelled';
      bid.timeCancelled = event.block.timestamp;
      bid.save();

      log.debug("handleCancelBid(): Bid cancelled: {}", [bid.id]);
    } else {
      log.error("handleCancelBid(): Cancelled bid not found - {}", [artwork.currentBid]);
    }
  } else {
    log.error("handleCancelBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleAcceptBid(event: AcceptBid): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = Bid.load(artwork.currentBid);
    if (bid != null) {
      bid.status = 'Accepted';
      bid.acceptedBy = _loadAccount(event.params._seller);
      bid.timeAccepted = event.block.timestamp;
      bid.save();

      log.debug("handleAcceptBid(): Bid accepted: {}, {}", [bid.id, bid.acceptedBy]);
    } else {
      log.error("handleAcceptBid(): Accepted bid not found - {}", [artwork.currentBid]);
    }

    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = event.params._amount;
    artwork.save();
  } else {
    log.error("handleAcceptBid(): Artwork not found - {}", [tokenIdStr]);
  }
}

function _loadAccount(address: Address): string {
  let accountId = address.toHex();
  let account = Account.load(accountId);

  if (account == null) {
    account = new Account(accountId);
    account.address = address;
    account.save();
  }

  return accountId;
}