import { BigInt } from "@graphprotocol/graph-ts"
import {
  Contract,
  TokenURIUpdated,
  AddToWhitelist,
  RemoveFromWhitelist,
  OwnershipTransferred,
  Transfer,
  Approval,
  ApprovalForAll
} from "../generated/Contract/Contract"
import { ExampleEntity } from "../generated/schema"

export function handleTokenURIUpdated(event: TokenURIUpdated): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (entity == null) {
    entity = new ExampleEntity(event.transaction.from.toHex())

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromI32(0)
  }

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity._tokenId = event.params._tokenId
  entity._uri = event.params._uri

  // Entities can be written to the store with `.save()`
  entity.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.supportsInterface(...)
  // - contract.name(...)
  // - contract.getApproved(...)
  // - contract.totalSupply(...)
  // - contract.tokenOfOwnerByIndex(...)
  // - contract.isWhitelisted(...)
  // - contract.tokenCreator(...)
  // - contract.tokenByIndex(...)
  // - contract.ownerOf(...)
  // - contract.balanceOf(...)
  // - contract.owner(...)
  // - contract.isOwner(...)
  // - contract.symbol(...)
  // - contract.tokenURI(...)
  // - contract.isApprovedForAll(...)
}

export function handleAddToWhitelist(event: AddToWhitelist): void {}

export function handleRemoveFromWhitelist(event: RemoveFromWhitelist): void {}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleTransfer(event: Transfer): void {}

export function handleApproval(event: Approval): void {}

export function handleApprovalForAll(event: ApprovalForAll): void {}
