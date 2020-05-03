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
    artwork.status = 'Created';
    artwork.timeCreated = event.block.timestamp;
    artwork.save();

    log.debug("handleTransfer(): Artwork created - {}, {}, {}, {}", [tokenIdStr, artwork.artist, artwork.uri, artwork.timeCreated.toString()]);

  } else {
    let artwork = Artwork.load(tokenIdStr);
    if (artwork != null) {
      if (event.params.to.toHex() != BIRTH_ADDRESS) {
        let transfer = new Transfer(tokenIdStr + event.block.timestamp.toString());
        transfer.from = _loadAccount(event.params.from);
        transfer.to = _loadAccount(event.params.to);
        transfer.timestamp = event.block.timestamp;
        artwork.transfers.push(transfer.id);

        artwork.owner = _loadAccount(event.params.to);
        artwork.timeLastTransferred = transfer.timestamp;

        log.debug("handleTransfer(): Artwork tranferred - {}, {}, {}", [tokenIdStr, transfer.from, transfer.to]);
      } else {
        artwork.timeWithdrawn = event.block.timestamp;
        log.debug("handleTransfer(): Artwork withdrawn - {}, {}", [tokenIdStr, artwork.timeWithdrawn.toString()]);
      }
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
        log.debug("handleSetSalePrice(): Set new sale price - {}, {}", [tokenIdStr, sale.price.toString()]);
      } else {
        log.error("handleSetSalePrice(): Current sale not found - {}", [tokenIdStr]);
      }
    } else {
      let sale = new Sale(tokenIdStr + event.block.timestamp.toString());
      sale.seller = artwork.owner;
      sale.price = event.params._amount;
      sale.timeRaised = event.block.timestamp;
      sale.isSold = false;

      artwork.status = (artwork.status == 'Created') ? 'OnPrimarySale' : 'OnSecondarySale';
      artwork.currentSale = sale.id;

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
    } else {
      log.error("handleSold(): Sale not found - {}", [artwork.currentSale]);
    }

    artwork.status = 'Sold';
    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = event.params._amount;
    artwork.timeLastTransferred = event.block.timestamp;

    log.debug("handleSold(): Artwork sold - {}, {}, {}", [tokenIdStr, event.params._buyer.toHex(), artwork.lastTransferPrice.toString()]);
  } else {
    log.error("handleSold(): Artwork not found - {}", [tokenIdStr]);
  }
}

export function handleBid(event: BidEvent): void {
  let tokenIdStr = event.params._tokenId.toString();
  let artwork = Artwork.load(tokenIdStr);

  if (artwork != null) {
    let bid = new Bid(tokenIdStr + event.block.timestamp.toString() + event.params._bidder.toHex());
    bid.bidder = _loadAccount(event.params._bidder);
    bid.price = event.params._amount;
    bid.timeRaised = event.block.timestamp;
    bid.status = 'Open';

    artwork.bids.push(bid.id);
    artwork.currentBid = bid.id;

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

      log.debug("handleAcceptBid(): Bid accepted: {}, {}", [bid.id, bid.acceptedBy]);
    } else {
      log.error("handleAcceptBid(): Accepted bid not found - {}", [artwork.currentBid]);
    }

    artwork.status = 'Sold';
    artwork.currentBid = null;
    artwork.currentSale = null;
    artwork.lastTransferPrice = event.params._amount;
    artwork.timeLastTransferred = event.block.timestamp;
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