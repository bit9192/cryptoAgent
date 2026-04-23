// Backward-compat shim: 历史 defaults API 迁移到 contracts 配置。
import {
  EVM_DEFAULT_CONTRACT_BOOK,
  getEvmContractBook,
  resolveEvmContract,
} from "./contracts.js";

export const EVM_DEFAULT_ADDRESS_BOOK = EVM_DEFAULT_CONTRACT_BOOK;

export function getEvmAddressBook(input = {}) {
  const result = getEvmContractBook(input);
  return {
    chainId: result.chainId,
    addresses: result.contracts,
  };
}

export function resolveEvmAddress(input = {}) {
  return resolveEvmContract(input);
}
