// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISwap.sol";

contract Trade {
	uint256 public constant BPS_DENOMINATOR = 10_000;

	address public owner;
	address public swapRouter;
	address public usdt;
	uint256 public defaultSlippageBps = 100; // 1%

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	event RouterUpdated(address indexed oldRouter, address indexed newRouter);
	event UsdtUpdated(address indexed oldUsdt, address indexed newUsdt);
	event DefaultSlippageUpdated(uint256 oldBps, uint256 newBps);
	event SwapByOwner(
		address indexed user,
		address indexed tokenIn,
		address indexed tokenOut,
		uint256 amountIn,
		uint256 amountOut,
		address recipient
	);
	event NativeSwapToUsdt(address indexed sender, uint256 amountIn, uint256 amountOut, address indexed recipient);

	modifier onlyOwner() {
		require(msg.sender == owner, "Trade: only owner");
		_;
	}

	constructor(address router_, address usdt_) {
		require(router_ != address(0), "Trade: router is zero");
		require(usdt_ != address(0), "Trade: usdt is zero");
		owner = msg.sender;
		swapRouter = router_;
		usdt = usdt_;
		emit OwnershipTransferred(address(0), owner);
	}

	receive() external payable {
		_swapNativeToUsdt(msg.sender, msg.value, block.timestamp + 600);
	}

	function transferOwnership(address newOwner) external onlyOwner {
		require(newOwner != address(0), "Trade: new owner is zero");
		emit OwnershipTransferred(owner, newOwner);
		owner = newOwner;
	}

	function setSwapRouter(address newRouter) external onlyOwner {
		require(newRouter != address(0), "Trade: router is zero");
		emit RouterUpdated(swapRouter, newRouter);
		swapRouter = newRouter;
	}

	function setUsdt(address newUsdt) external onlyOwner {
		require(newUsdt != address(0), "Trade: usdt is zero");
		emit UsdtUpdated(usdt, newUsdt);
		usdt = newUsdt;
	}

	function setDefaultSlippageBps(uint256 newBps) external onlyOwner {
		require(newBps <= 1_000, "Trade: slippage too high"); // <=10%
		emit DefaultSlippageUpdated(defaultSlippageBps, newBps);
		defaultSlippageBps = newBps;
	}

	function swapFromUser(
		address user,
		address tokenIn,
		address tokenOut,
		uint256 amountIn,
		address recipient,
		uint256 deadline
	) external onlyOwner returns (uint256 amountOut) {
		require(user != address(0), "Trade: user is zero");
		require(tokenIn != address(0) && tokenOut != address(0), "Trade: token is zero");
		require(recipient != address(0), "Trade: recipient is zero");
		require(tokenIn != tokenOut, "Trade: tokenIn == tokenOut");
		require(amountIn > 0, "Trade: amountIn is zero");

		require(ISwapERC20(tokenIn).transferFrom(user, address(this), amountIn), "Trade: transferFrom failed");
		_approveIfNeeded(tokenIn, amountIn);

		address[] memory path = _buildPath(tokenIn, tokenOut);
		uint256 minOut = _calcAmountOutMin(amountIn, path);

		uint256[] memory amounts = ISwapV2Router(swapRouter).swapExactTokensForTokens(
			amountIn,
			minOut,
			path,
			recipient,
			deadline
		);
		amountOut = amounts[amounts.length - 1];

		emit SwapByOwner(user, tokenIn, tokenOut, amountIn, amountOut, recipient);
	}

	function swapNativeToUsdt(address recipient, uint256 deadline) external payable returns (uint256 amountOut) {
		return _swapNativeToUsdt(recipient, msg.value, deadline);
	}

	function rescueToken(address token, address to, uint256 amount) external onlyOwner {
		require(to != address(0), "Trade: to is zero");
		require(ISwapERC20(token).transfer(to, amount), "Trade: rescue token failed");
	}

	function rescueNative(address payable to, uint256 amount) external onlyOwner {
		require(to != address(0), "Trade: to is zero");
		(bool ok, ) = to.call{ value: amount }("");
		require(ok, "Trade: rescue native failed");
	}

	function _swapNativeToUsdt(address recipient, uint256 amountIn, uint256 deadline) internal returns (uint256 amountOut) {
		require(recipient != address(0), "Trade: recipient is zero");
		require(amountIn > 0, "Trade: amountIn is zero");

		address[] memory path = new address[](2);
		path[0] = ISwapV2Router(swapRouter).WETH();
		path[1] = usdt;

		uint256 minOut = _calcAmountOutMin(amountIn, path);
		uint256[] memory amounts = ISwapV2Router(swapRouter).swapExactETHForTokens{ value: amountIn }(
			minOut,
			path,
			recipient,
			deadline
		);
		amountOut = amounts[amounts.length - 1];

		emit NativeSwapToUsdt(msg.sender, amountIn, amountOut, recipient);
	}

	function _buildPath(address tokenIn, address tokenOut) internal view returns (address[] memory path) {
		address weth = ISwapV2Router(swapRouter).WETH();

		if (tokenIn == weth || tokenOut == weth) {
			path = new address[](2);
			path[0] = tokenIn;
			path[1] = tokenOut;
		} else {
			path = new address[](3);
			path[0] = tokenIn;
			path[1] = weth;
			path[2] = tokenOut;
		}
	}

	function _calcAmountOutMin(uint256 amountIn, address[] memory path) internal view returns (uint256) {
		uint256[] memory quote = ISwapV2Router(swapRouter).getAmountsOut(amountIn, path);
		uint256 quotedOut = quote[quote.length - 1];
		return (quotedOut * (BPS_DENOMINATOR - defaultSlippageBps)) / BPS_DENOMINATOR;
	}

	function _approveIfNeeded(address token, uint256 amount) internal {
		uint256 current = ISwapERC20(token).allowance(address(this), swapRouter);
		if (current < amount) {
			if (current > 0) {
				require(ISwapERC20(token).approve(swapRouter, 0), "Trade: reset approve failed");
			}
			require(ISwapERC20(token).approve(swapRouter, type(uint256).max), "Trade: approve failed");
		}
	}
}
