// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISwapERC20 {
	function name() external view returns (string memory);

	function symbol() external view returns (string memory);

	function decimals() external view returns (uint8);

	function totalSupply() external view returns (uint256);

	function balanceOf(address owner) external view returns (uint256);

	function allowance(address owner, address spender) external view returns (uint256);

	function approve(address spender, uint256 amount) external returns (bool);

	function transfer(address to, uint256 amount) external returns (bool);

	function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ISwapWETH is ISwapERC20 {
	function deposit() external payable;

	function withdraw(uint256 amount) external;
}

interface ISwapV2Factory {
	event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

	function feeTo() external view returns (address);

	function feeToSetter() external view returns (address);

	function getPair(address tokenA, address tokenB) external view returns (address pair);

	function allPairs(uint256 index) external view returns (address pair);

	function allPairsLength() external view returns (uint256);

	function createPair(address tokenA, address tokenB) external returns (address pair);

	function setFeeTo(address) external;

	function setFeeToSetter(address) external;
}

interface ISwapV2Pair is ISwapERC20 {
	event Approval(address indexed owner, address indexed spender, uint256 value);
	event Transfer(address indexed from, address indexed to, uint256 value);
	event Mint(address indexed sender, uint256 amount0, uint256 amount1);
	event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
	event Swap(
		address indexed sender,
		uint256 amount0In,
		uint256 amount1In,
		uint256 amount0Out,
		uint256 amount1Out,
		address indexed to
	);
	event Sync(uint112 reserve0, uint112 reserve1);

	function MINIMUM_LIQUIDITY() external pure returns (uint256);

	function factory() external view returns (address);

	function token0() external view returns (address);

	function token1() external view returns (address);

	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

	function price0CumulativeLast() external view returns (uint256);

	function price1CumulativeLast() external view returns (uint256);

	function kLast() external view returns (uint256);

	function mint(address to) external returns (uint256 liquidity);

	function burn(address to) external returns (uint256 amount0, uint256 amount1);

	function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;

	function skim(address to) external;

	function sync() external;

	function initialize(address token0, address token1) external;
}

interface ISwapV2Router {
	function factory() external view returns (address);

	function WETH() external view returns (address);

	function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
		external
		pure
		returns (uint256 amountB);

	function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
		external
		pure
		returns (uint256 amountOut);

	function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
		external
		pure
		returns (uint256 amountIn);

	function getAmountsOut(uint256 amountIn, address[] calldata path)
		external
		view
		returns (uint256[] memory amounts);

	function getAmountsIn(uint256 amountOut, address[] calldata path)
		external
		view
		returns (uint256[] memory amounts);

	function addLiquidity(
		address tokenA,
		address tokenB,
		uint256 amountADesired,
		uint256 amountBDesired,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline
	) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

	function addLiquidityETH(
		address token,
		uint256 amountTokenDesired,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

	function removeLiquidity(
		address tokenA,
		address tokenB,
		uint256 liquidity,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline
	) external returns (uint256 amountA, uint256 amountB);

	function removeLiquidityETH(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external returns (uint256 amountToken, uint256 amountETH);

	function removeLiquidityWithPermit(
		address tokenA,
		address tokenB,
		uint256 liquidity,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external returns (uint256 amountA, uint256 amountB);

	function removeLiquidityETHWithPermit(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external returns (uint256 amountToken, uint256 amountETH);

	function swapExactTokensForTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external returns (uint256[] memory amounts);

	function swapTokensForExactTokens(
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external returns (uint256[] memory amounts);

	function swapExactETHForTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable returns (uint256[] memory amounts);

	function swapTokensForExactETH(
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external returns (uint256[] memory amounts);

	function swapExactTokensForETH(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external returns (uint256[] memory amounts);

	function swapETHForExactTokens(
		uint256 amountOut,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable returns (uint256[] memory amounts);

	function swapExactTokensForTokensSupportingFeeOnTransferTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external;

	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable;

	function swapExactTokensForETHSupportingFeeOnTransferTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external;

	function removeLiquidityETHSupportingFeeOnTransferTokens(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external returns (uint256 amountETH);

	function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external returns (uint256 amountETH);
}

interface ISwapV3Factory {
	event OwnerChanged(address indexed oldOwner, address indexed newOwner);
	event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool);
	event FeeAmountEnabled(uint24 indexed fee, int24 indexed tickSpacing);

	function owner() external view returns (address);

	function feeAmountTickSpacing(uint24 fee) external view returns (int24);

	function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);

	function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);

	function setOwner(address _owner) external;

	function enableFeeAmount(uint24 fee, int24 tickSpacing) external;
}

interface ISwapV3Pool {
	function factory() external view returns (address);

	function token0() external view returns (address);

	function token1() external view returns (address);

	function fee() external view returns (uint24);

	function tickSpacing() external view returns (int24);

	function maxLiquidityPerTick() external view returns (uint128);

	function liquidity() external view returns (uint128);

	function slot0()
		external
		view
		returns (
			uint160 sqrtPriceX96,
			int24 tick,
			uint16 observationIndex,
			uint16 observationCardinality,
			uint16 observationCardinalityNext,
			uint8 feeProtocol,
			bool unlocked
		);

	function feeGrowthGlobal0X128() external view returns (uint256);

	function feeGrowthGlobal1X128() external view returns (uint256);

	function protocolFees() external view returns (uint128 token0, uint128 token1);

	function ticks(int24 tick)
		external
		view
		returns (
			uint128 liquidityGross,
			int128 liquidityNet,
			uint256 feeGrowthOutside0X128,
			uint256 feeGrowthOutside1X128,
			int56 tickCumulativeOutside,
			uint160 secondsPerLiquidityOutsideX128,
			uint32 secondsOutside,
			bool initialized
		);

	function tickBitmap(int16 wordPosition) external view returns (uint256);

	function positions(bytes32 key)
		external
		view
		returns (
			uint128 _liquidity,
			uint256 feeGrowthInside0LastX128,
			uint256 feeGrowthInside1LastX128,
			uint128 tokensOwed0,
			uint128 tokensOwed1
		);

	function observations(uint256 index)
		external
		view
		returns (
			uint32 blockTimestamp,
			int56 tickCumulative,
			uint160 secondsPerLiquidityCumulativeX128,
			bool initialized
		);

	function observe(uint32[] calldata secondsAgos)
		external
		view
		returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);

	function snapshotCumulativesInside(int24 tickLower, int24 tickUpper)
		external
		view
		returns (
			int56 tickCumulativeInside,
			uint160 secondsPerLiquidityInsideX128,
			uint32 secondsInside
		);

	function initialize(uint160 sqrtPriceX96) external;

	function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
		external
		returns (uint256 amount0, uint256 amount1);

	function collect(
		address recipient,
		int24 tickLower,
		int24 tickUpper,
		uint128 amount0Requested,
		uint128 amount1Requested
	) external returns (uint128 amount0, uint128 amount1);

	function burn(int24 tickLower, int24 tickUpper, uint128 amount)
		external
		returns (uint256 amount0, uint256 amount1);

	function swap(
		address recipient,
		bool zeroForOne,
		int256 amountSpecified,
		uint160 sqrtPriceLimitX96,
		bytes calldata data
	) external returns (int256 amount0, int256 amount1);

	function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;

	function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

	function setFeeProtocol(uint8 feeProtocol0, uint8 feeProtocol1) external;

	function collectProtocol(address recipient, uint128 amount0Requested, uint128 amount1Requested)
		external
		returns (uint128 amount0, uint128 amount1);
}

interface ISwapV3Router {
	struct ExactInputSingleParams {
		address tokenIn;
		address tokenOut;
		uint24 fee;
		address recipient;
		uint256 deadline;
		uint256 amountIn;
		uint256 amountOutMinimum;
		uint160 sqrtPriceLimitX96;
	}

	struct ExactInputParams {
		bytes path;
		address recipient;
		uint256 deadline;
		uint256 amountIn;
		uint256 amountOutMinimum;
	}

	struct ExactOutputSingleParams {
		address tokenIn;
		address tokenOut;
		uint24 fee;
		address recipient;
		uint256 deadline;
		uint256 amountOut;
		uint256 amountInMaximum;
		uint160 sqrtPriceLimitX96;
	}

	struct ExactOutputParams {
		bytes path;
		address recipient;
		uint256 deadline;
		uint256 amountOut;
		uint256 amountInMaximum;
	}

	function WETH9() external view returns (address);

	function exactInputSingle(ExactInputSingleParams calldata params)
		external
		payable
		returns (uint256 amountOut);

	function exactInput(ExactInputParams calldata params)
		external
		payable
		returns (uint256 amountOut);

	function exactOutputSingle(ExactOutputSingleParams calldata params)
		external
		payable
		returns (uint256 amountIn);

	function exactOutput(ExactOutputParams calldata params)
		external
		payable
		returns (uint256 amountIn);

	function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;

	function refundETH() external payable;

	function unwrapWETH9(uint256 amountMinimum, address recipient) external payable;

	function sweepToken(address token, uint256 amountMinimum, address recipient) external payable;

	function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}

interface ISwapV3Quoter {
	function quoteExactInput(bytes memory path, uint256 amountIn)
		external
		returns (uint256 amountOut);

	function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)
		external
		returns (uint256 amountOut);

	function quoteExactOutput(bytes memory path, uint256 amountOut)
		external
		returns (uint256 amountIn);

	function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96)
		external
		returns (uint256 amountIn);
}

interface ISwapV3QuoterV2 {
	function quoteExactInput(bytes memory path, uint256 amountIn)
		external
		returns (
			uint256 amountOut,
			uint160[] memory sqrtPriceX96AfterList,
			uint32[] memory initializedTicksCrossedList,
			uint256 gasEstimate
		);

	function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)
		external
		returns (
			uint256 amountOut,
			uint160 sqrtPriceX96After,
			uint32 initializedTicksCrossed,
			uint256 gasEstimate
		);

	function quoteExactOutput(bytes memory path, uint256 amountOut)
		external
		returns (
			uint256 amountIn,
			uint160[] memory sqrtPriceX96AfterList,
			uint32[] memory initializedTicksCrossedList,
			uint256 gasEstimate
		);

	function quoteExactOutputSingle(address tokenIn, address tokenOut, uint256 amountOut, uint24 fee, uint160 sqrtPriceLimitX96)
		external
		returns (
			uint256 amountIn,
			uint160 sqrtPriceX96After,
			uint32 initializedTicksCrossed,
			uint256 gasEstimate
		);
}

interface ISwapV3PositionManager {
	struct MintParams {
		address token0;
		address token1;
		uint24 fee;
		int24 tickLower;
		int24 tickUpper;
		uint256 amount0Desired;
		uint256 amount1Desired;
		uint256 amount0Min;
		uint256 amount1Min;
		address recipient;
		uint256 deadline;
	}

	struct IncreaseLiquidityParams {
		uint256 tokenId;
		uint256 amount0Desired;
		uint256 amount1Desired;
		uint256 amount0Min;
		uint256 amount1Min;
		uint256 deadline;
	}

	struct DecreaseLiquidityParams {
		uint256 tokenId;
		uint128 liquidity;
		uint256 amount0Min;
		uint256 amount1Min;
		uint256 deadline;
	}

	struct CollectParams {
		uint256 tokenId;
		address recipient;
		uint128 amount0Max;
		uint128 amount1Max;
	}

	function factory() external view returns (address);

	function WETH9() external view returns (address);

	function positions(uint256 tokenId)
		external
		view
		returns (
			uint96 nonce,
			address operator,
			address token0,
			address token1,
			uint24 fee,
			int24 tickLower,
			int24 tickUpper,
			uint128 liquidity,
			uint256 feeGrowthInside0LastX128,
			uint256 feeGrowthInside1LastX128,
			uint128 tokensOwed0,
			uint128 tokensOwed1
		);

	function mint(MintParams calldata params)
		external
		payable
		returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

	function increaseLiquidity(IncreaseLiquidityParams calldata params)
		external
		payable
		returns (uint128 liquidity, uint256 amount0, uint256 amount1);

	function decreaseLiquidity(DecreaseLiquidityParams calldata params)
		external
		payable
		returns (uint256 amount0, uint256 amount1);

	function collect(CollectParams calldata params)
		external
		payable
		returns (uint256 amount0, uint256 amount1);

	function burn(uint256 tokenId) external payable;

	function refundETH() external payable;

	function unwrapWETH9(uint256 amountMinimum, address recipient) external payable;

	function sweepToken(address token, uint256 amountMinimum, address recipient) external payable;

	function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}
