// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISwap.sol";

library MockSwapMath {
	function min(uint256 a, uint256 b) internal pure returns (uint256) {
		return a < b ? a : b;
	}

	function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
		require(b != 0, "DIV_BY_ZERO");
		return a == 0 ? 0 : ((a - 1) / b) + 1;
	}
}

library MockSwapTransferHelper {
	function safeTransfer(address token, address to, uint256 value) internal {
		(bool success, bytes memory data) = token.call(
			abi.encodeWithSelector(ISwapERC20.transfer.selector, to, value)
		);
		require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
	}

	function safeTransferFrom(address token, address from, address to, uint256 value) internal {
		(bool success, bytes memory data) = token.call(
			abi.encodeWithSelector(ISwapERC20.transferFrom.selector, from, to, value)
		);
		require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
	}

	function safeTransferETH(address to, uint256 value) internal {
		(bool success, ) = payable(to).call{value: value}("");
		require(success, "ETH_TRANSFER_FAILED");
	}
}

library MockSwapV3Path {
	function poolCount(bytes memory path) internal pure returns (uint256) {
		require(path.length >= 43 && (path.length - 20) % 23 == 0, "INVALID_PATH");
		return (path.length - 20) / 23;
	}

	function toAddress(bytes memory data, uint256 start) internal pure returns (address addr) {
		require(data.length >= start + 20, "ADDRESS_OUT_OF_BOUNDS");
		assembly {
			addr := shr(96, mload(add(add(data, 0x20), start)))
		}
	}

	function toUint24(bytes memory data, uint256 start) internal pure returns (uint24 value) {
		require(data.length >= start + 3, "UINT24_OUT_OF_BOUNDS");
		assembly {
			value := shr(232, mload(add(add(data, 0x20), start)))
		}
	}

	function decodeForward(bytes memory path)
		internal
		pure
		returns (address[] memory tokens, uint24[] memory fees)
	{
		uint256 pools = poolCount(path);
		tokens = new address[](pools + 1);
		fees = new uint24[](pools);

		tokens[0] = toAddress(path, 0);
		for (uint256 i = 0; i < pools; i++) {
			uint256 offset = 20 + (i * 23);
			fees[i] = toUint24(path, offset);
			tokens[i + 1] = toAddress(path, offset + 3);
		}
	}

	function decodeExactOutputToForward(bytes memory reversePath)
		internal
		pure
		returns (address[] memory tokens, uint24[] memory fees)
	{
		(address[] memory reversedTokens, uint24[] memory reversedFees) = decodeForward(reversePath);
		uint256 pools = reversedFees.length;
		tokens = new address[](reversedTokens.length);
		fees = new uint24[](pools);

		for (uint256 i = 0; i < reversedTokens.length; i++) {
			tokens[i] = reversedTokens[reversedTokens.length - 1 - i];
		}

		for (uint256 i = 0; i < pools; i++) {
			fees[i] = reversedFees[pools - 1 - i];
		}
	}
}

contract UniswapV3Pool is ISwapV3Pool {
	using MockSwapMath for uint256;

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

	address public immutable override factory;
	address public immutable override token0;
	address public immutable override token1;
	uint24 public immutable override fee;
	int24 public immutable override tickSpacing;
	uint128 public override liquidity;
	uint256 public override feeGrowthGlobal0X128;
	uint256 public override feeGrowthGlobal1X128;

	struct Slot0State {
		uint160 sqrtPriceX96;
		int24 tick;
		uint16 observationIndex;
		uint16 observationCardinality;
		uint16 observationCardinalityNext;
		uint8 feeProtocol;
		bool unlocked;
	}

	struct TickInfo {
		uint128 liquidityGross;
		int128 liquidityNet;
		uint256 feeGrowthOutside0X128;
		uint256 feeGrowthOutside1X128;
		int56 tickCumulativeOutside;
		uint160 secondsPerLiquidityOutsideX128;
		uint32 secondsOutside;
		bool initialized;
	}

	struct PositionInfo {
		uint128 liquidity;
		uint256 feeGrowthInside0LastX128;
		uint256 feeGrowthInside1LastX128;
		uint128 tokensOwed0;
		uint128 tokensOwed1;
	}

	struct Observation {
		uint32 blockTimestamp;
		int56 tickCumulative;
		uint160 secondsPerLiquidityCumulativeX128;
		bool initialized;
	}

	struct ProtocolFeeState {
		uint128 token0;
		uint128 token1;
	}

	Slot0State private _slot0State;
	ProtocolFeeState private _protocolFees;
	uint256 public reserve0;
	uint256 public reserve1;
	uint8 public feeProtocol0;
	uint8 public feeProtocol1;

	mapping(int24 => TickInfo) private _ticks;
	mapping(int16 => uint256) private _tickBitmap;
	mapping(bytes32 => PositionInfo) private _positions;
	mapping(uint256 => Observation) private _observations;

	constructor(address _factory, address _token0, address _token1, uint24 _fee, int24 _tickSpacing) {
		factory = _factory;
		token0 = _token0;
		token1 = _token1;
		fee = _fee;
		tickSpacing = _tickSpacing;
		_slot0State.unlocked = true;
		_slot0State.observationCardinality = 1;
		_slot0State.observationCardinalityNext = 1;
		_observations[0] = Observation(uint32(block.timestamp), 0, 0, true);
	}

	function maxLiquidityPerTick() external pure override returns (uint128) {
		return type(uint128).max;
	}

	function slot0()
		external
		view
		override
		returns (
			uint160 sqrtPriceX96,
			int24 tick,
			uint16 observationIndex,
			uint16 observationCardinality,
			uint16 observationCardinalityNext,
			uint8 feeProtocol,
			bool unlocked
		)
	{
		Slot0State memory state = _slot0State;
		return (
			state.sqrtPriceX96,
			state.tick,
			state.observationIndex,
			state.observationCardinality,
			state.observationCardinalityNext,
			state.feeProtocol,
			state.unlocked
		);
	}

	function protocolFees() external view override returns (uint128 token0Fees, uint128 token1Fees) {
		return (_protocolFees.token0, _protocolFees.token1);
	}

	function ticks(int24 tick)
		external
		view
		override
		returns (
			uint128 liquidityGross,
			int128 liquidityNet,
			uint256 feeGrowthOutside0X128,
			uint256 feeGrowthOutside1X128,
			int56 tickCumulativeOutside,
			uint160 secondsPerLiquidityOutsideX128,
			uint32 secondsOutside,
			bool initialized
		)
	{
		TickInfo memory info = _ticks[tick];
		return (
			info.liquidityGross,
			info.liquidityNet,
			info.feeGrowthOutside0X128,
			info.feeGrowthOutside1X128,
			info.tickCumulativeOutside,
			info.secondsPerLiquidityOutsideX128,
			info.secondsOutside,
			info.initialized
		);
	}

	function tickBitmap(int16 wordPosition) external view override returns (uint256) {
		return _tickBitmap[wordPosition];
	}

	function positions(bytes32 key)
		external
		view
		override
		returns (
			uint128 _liquidity,
			uint256 feeGrowthInside0LastX128,
			uint256 feeGrowthInside1LastX128,
			uint128 tokensOwed0,
			uint128 tokensOwed1
		)
	{
		PositionInfo memory position = _positions[key];
		return (
			position.liquidity,
			position.feeGrowthInside0LastX128,
			position.feeGrowthInside1LastX128,
			position.tokensOwed0,
			position.tokensOwed1
		);
	}

	function observations(uint256 index)
		external
		view
		override
		returns (
			uint32 blockTimestamp,
			int56 tickCumulative,
			uint160 secondsPerLiquidityCumulativeX128,
			bool initialized
		)
	{
		Observation memory observation = _observations[index];
		return (
			observation.blockTimestamp,
			observation.tickCumulative,
			observation.secondsPerLiquidityCumulativeX128,
			observation.initialized
		);
	}

	function observe(uint32[] calldata secondsAgos)
		external
		pure
		override
		returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
	{
		tickCumulatives = new int56[](secondsAgos.length);
		secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
		for (uint256 i = 0; i < secondsAgos.length; i++) {
			tickCumulatives[i] = 0;
			secondsPerLiquidityCumulativeX128s[i] = 0;
		}
	}

	function snapshotCumulativesInside(int24, int24)
		external
		view
		override
		returns (int56 tickCumulativeInside, uint160 secondsPerLiquidityInsideX128, uint32 secondsInside)
	{
		return (0, 0, uint32(block.timestamp));
	}

	function initialize(uint160 sqrtPriceX96) external override {
		require(_slot0State.sqrtPriceX96 == 0, "ALREADY_INITIALIZED");
		require(sqrtPriceX96 > 0, "INVALID_PRICE");
		_slot0State.sqrtPriceX96 = sqrtPriceX96;
		_slot0State.tick = 0;
	}

	function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
		external
		override
		returns (uint256 amount0, uint256 amount1)
	{
		(amount0, amount1) = abi.decode(data, (uint256, uint256));
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransferFrom(token0, msg.sender, address(this), amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransferFrom(token1, msg.sender, address(this), amount1);
		}
		_addLiquidity(amount0, amount1, amount);
		bytes32 key = keccak256(abi.encode(recipient, tickLower, tickUpper));
		_positions[key].liquidity += amount;
	}

	function collect(
		address recipient,
		int24 tickLower,
		int24 tickUpper,
		uint128 amount0Requested,
		uint128 amount1Requested
	) external override returns (uint128 amount0, uint128 amount1) {
		bytes32 key = keccak256(abi.encode(msg.sender, tickLower, tickUpper));
		PositionInfo storage position = _positions[key];
		amount0 = position.tokensOwed0 > amount0Requested ? amount0Requested : position.tokensOwed0;
		amount1 = position.tokensOwed1 > amount1Requested ? amount1Requested : position.tokensOwed1;
		position.tokensOwed0 -= amount0;
		position.tokensOwed1 -= amount1;
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransfer(token0, recipient, amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransfer(token1, recipient, amount1);
		}
	}

	function burn(int24 tickLower, int24 tickUpper, uint128 amount)
		external
		override
		returns (uint256 amount0, uint256 amount1)
	{
		bytes32 key = keccak256(abi.encode(msg.sender, tickLower, tickUpper));
		PositionInfo storage position = _positions[key];
		require(position.liquidity >= amount, "INSUFFICIENT_LIQUIDITY");
		(amount0, amount1) = _removeLiquidity(msg.sender, amount);
		position.liquidity -= amount;
	}

	function swap(
		address recipient,
		bool zeroForOne,
		int256 amountSpecified,
		uint160,
		bytes calldata
	) external override returns (int256 amount0, int256 amount1) {
		if (amountSpecified > 0) {
			uint256 amountIn = uint256(amountSpecified);
			address tokenIn = zeroForOne ? token0 : token1;
			uint256 amountOut = executeSwapExactInput(tokenIn, amountIn, recipient);
			if (zeroForOne) {
				return (int256(amountIn), -int256(amountOut));
			}
			return (-int256(amountOut), int256(amountIn));
		}

		uint256 desiredOut = uint256(-amountSpecified);
		address tokenOut = zeroForOne ? token1 : token0;
		uint256 amountInNeeded = executeSwapExactOutput(tokenOut, desiredOut, recipient);
		if (zeroForOne) {
			return (int256(amountInNeeded), -int256(desiredOut));
		}
		return (-int256(desiredOut), int256(amountInNeeded));
	}

	function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata) external override {
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransfer(token0, recipient, amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransfer(token1, recipient, amount1);
		}
	}

	function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external override {
		if (observationCardinalityNext > _slot0State.observationCardinalityNext) {
			_slot0State.observationCardinalityNext = observationCardinalityNext;
		}
	}

	function setFeeProtocol(uint8 _feeProtocol0, uint8 _feeProtocol1) external override {
		require(msg.sender == factory, "ONLY_FACTORY");
		feeProtocol0 = _feeProtocol0;
		feeProtocol1 = _feeProtocol1;
		_slot0State.feeProtocol = _feeProtocol0;
	}

	function collectProtocol(address recipient, uint128 amount0Requested, uint128 amount1Requested)
		external
		override
		returns (uint128 amount0, uint128 amount1)
	{
		require(msg.sender == factory, "ONLY_FACTORY");
		amount0 = _protocolFees.token0 > amount0Requested ? amount0Requested : _protocolFees.token0;
		amount1 = _protocolFees.token1 > amount1Requested ? amount1Requested : _protocolFees.token1;
		_protocolFees.token0 -= amount0;
		_protocolFees.token1 -= amount1;
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransfer(token0, recipient, amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransfer(token1, recipient, amount1);
		}
	}

	function quoteExactInput(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
		require(amountIn > 0, "INVALID_AMOUNT");
		(bool zeroForOne, uint256 reserveIn, uint256 reserveOut) = _reservesFor(tokenIn);
		require(reserveIn > 0 && reserveOut > 0, "INSUFFICIENT_LIQUIDITY");
		uint256 amountInAfterFee = (amountIn * (1_000_000 - fee)) / 1_000_000;
		require(amountInAfterFee > 0, "AMOUNT_TOO_SMALL");
		amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
		require(amountOut < reserveOut, "INSUFFICIENT_OUTPUT");
		zeroForOne;
	}

	function quoteExactOutput(address tokenOut, uint256 amountOut) public view returns (uint256 amountIn) {
		require(amountOut > 0, "INVALID_AMOUNT");
		(bool zeroForOne, uint256 reserveIn, uint256 reserveOut) = _reservesForOutput(tokenOut);
		require(reserveIn > 0 && reserveOut > amountOut, "INSUFFICIENT_LIQUIDITY");
		uint256 amountInAfterFee = MockSwapMath.ceilDiv(reserveIn * amountOut, reserveOut - amountOut);
		amountIn = MockSwapMath.ceilDiv(amountInAfterFee * 1_000_000, 1_000_000 - fee);
		zeroForOne;
	}

	function executeSwapExactInput(address tokenIn, uint256 amountIn, address recipient)
		public
		returns (uint256 amountOut)
	{
		amountOut = quoteExactInput(tokenIn, amountIn);
		if (tokenIn == token0) {
			reserve0 += amountIn;
			reserve1 -= amountOut;
			MockSwapTransferHelper.safeTransfer(token1, recipient, amountOut);
			emit Swap(msg.sender, amountIn, 0, 0, amountOut, recipient);
		} else {
			reserve1 += amountIn;
			reserve0 -= amountOut;
			MockSwapTransferHelper.safeTransfer(token0, recipient, amountOut);
			emit Swap(msg.sender, 0, amountIn, amountOut, 0, recipient);
		}
		_sync();
	}

	function executeSwapExactOutput(address tokenOut, uint256 amountOut, address recipient)
		public
		returns (uint256 amountIn)
	{
		amountIn = quoteExactOutput(tokenOut, amountOut);
		if (tokenOut == token1) {
			reserve0 += amountIn;
			reserve1 -= amountOut;
			MockSwapTransferHelper.safeTransfer(token1, recipient, amountOut);
			emit Swap(msg.sender, amountIn, 0, 0, amountOut, recipient);
		} else {
			reserve1 += amountIn;
			reserve0 -= amountOut;
			MockSwapTransferHelper.safeTransfer(token0, recipient, amountOut);
			emit Swap(msg.sender, 0, amountIn, amountOut, 0, recipient);
		}
		_sync();
	}

	function provideLiquidity(uint256 amount0, uint256 amount1) external returns (uint128 liquidityAdded) {
		uint128 desired = _liquidityFromAmounts(amount0, amount1);
		liquidityAdded = _addLiquidity(amount0, amount1, desired);
	}

	function removeLiquidity(address recipient, uint128 liquidityAmount)
		external
		returns (uint256 amount0, uint256 amount1)
	{
		return _removeLiquidity(recipient, liquidityAmount);
	}

	function _addLiquidity(uint256 amount0, uint256 amount1, uint128 desiredLiquidity)
		internal
		returns (uint128 liquidityAdded)
	{
		require(amount0 > 0 || amount1 > 0, "ZERO_LIQUIDITY_INPUT");
		if (_slot0State.sqrtPriceX96 == 0) {
			_slot0State.sqrtPriceX96 = uint160(1 << 96);
		}
		liquidityAdded = desiredLiquidity == 0 ? _liquidityFromAmounts(amount0, amount1) : desiredLiquidity;
		reserve0 += amount0;
		reserve1 += amount1;
		liquidity += liquidityAdded;
		emit Mint(msg.sender, amount0, amount1);
		_sync();
	}

	function _removeLiquidity(address recipient, uint128 liquidityAmount)
		internal
		returns (uint256 amount0, uint256 amount1)
	{
		require(liquidityAmount > 0, "ZERO_LIQUIDITY");
		require(liquidity >= liquidityAmount, "INSUFFICIENT_LIQUIDITY");
		amount0 = (reserve0 * liquidityAmount) / liquidity;
		amount1 = (reserve1 * liquidityAmount) / liquidity;
		liquidity -= liquidityAmount;
		reserve0 -= amount0;
		reserve1 -= amount1;
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransfer(token0, recipient, amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransfer(token1, recipient, amount1);
		}
		emit Burn(msg.sender, amount0, amount1, recipient);
		_sync();
	}

	function _reservesFor(address tokenIn)
		internal
		view
		returns (bool zeroForOne, uint256 reserveIn, uint256 reserveOut)
	{
		if (tokenIn == token0) {
			return (true, reserve0, reserve1);
		}
		require(tokenIn == token1, "INVALID_TOKEN_IN");
		return (false, reserve1, reserve0);
	}

	function _reservesForOutput(address tokenOut)
		internal
		view
		returns (bool zeroForOne, uint256 reserveIn, uint256 reserveOut)
	{
		if (tokenOut == token1) {
			return (true, reserve0, reserve1);
		}
		require(tokenOut == token0, "INVALID_TOKEN_OUT");
		return (false, reserve1, reserve0);
	}

	function _liquidityFromAmounts(uint256 amount0, uint256 amount1) internal pure returns (uint128) {
		uint256 base = amount0 == 0 || amount1 == 0 ? amount0 + amount1 : MockSwapMath.min(amount0, amount1);
		require(base > 0 && base <= type(uint128).max, "INVALID_LIQUIDITY");
		return uint128(base);
	}

	function _sync() internal {
		require(reserve0 <= type(uint112).max && reserve1 <= type(uint112).max, "RESERVE_OVERFLOW");
		emit Sync(uint112(reserve0), uint112(reserve1));
	}
}

contract UniswapV3Factory is ISwapV3Factory {
	address public override owner;

	mapping(uint24 => int24) public override feeAmountTickSpacing;
	mapping(bytes32 => address) private _pools;
	address[] public allPools;

	constructor() {
		owner = msg.sender;
		_enableFeeAmount(500, 10);
		_enableFeeAmount(3000, 60);
		_enableFeeAmount(10000, 200);
	}

	function getPool(address tokenA, address tokenB, uint24 fee) public view override returns (address pool) {
		(address token0, address token1) = _sortTokens(tokenA, tokenB);
		return _pools[_poolKey(token0, token1, fee)];
	}

	function createPool(address tokenA, address tokenB, uint24 fee) external override returns (address pool) {
		require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
		(address token0, address token1) = _sortTokens(tokenA, tokenB);
		require(token0 != address(0), "ZERO_ADDRESS");
		int24 spacing = feeAmountTickSpacing[fee];
		require(spacing != 0, "FEE_NOT_ENABLED");
		bytes32 key = _poolKey(token0, token1, fee);
		require(_pools[key] == address(0), "POOL_EXISTS");

		pool = address(new UniswapV3Pool(address(this), token0, token1, fee, spacing));
		_pools[key] = pool;
		allPools.push(pool);
		emit PoolCreated(token0, token1, fee, spacing, pool);
	}

	function setOwner(address _owner) external override {
		require(msg.sender == owner, "ONLY_OWNER");
		emit OwnerChanged(owner, _owner);
		owner = _owner;
	}

	function enableFeeAmount(uint24 fee, int24 tickSpacing) external override {
		require(msg.sender == owner, "ONLY_OWNER");
		_enableFeeAmount(fee, tickSpacing);
	}

	function _enableFeeAmount(uint24 fee, int24 tickSpacing) internal {
		require(fee < 1_000_000, "INVALID_FEE");
		require(tickSpacing > 0, "INVALID_SPACING");
		require(feeAmountTickSpacing[fee] == 0, "FEE_ALREADY_ENABLED");
		feeAmountTickSpacing[fee] = tickSpacing;
		emit FeeAmountEnabled(fee, tickSpacing);
	}

	function _poolKey(address token0, address token1, uint24 fee) internal pure returns (bytes32) {
		return keccak256(abi.encode(token0, token1, fee));
	}

	function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
		return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
	}
}

contract SwapRouter is ISwapV3Router {
	using MockSwapV3Path for bytes;

	address public immutable factory;
	address public immutable override WETH9;

	constructor(address factory_, address weth9_) {
		factory = factory_;
		WETH9 = weth9_;
	}

	receive() external payable {}

	function exactInputSingle(ExactInputSingleParams calldata params)
		external
		payable
		override
		returns (uint256 amountOut)
	{
		address recipient = params.recipient == address(0) ? msg.sender : params.recipient;
		address pool = _poolFor(params.tokenIn, params.tokenOut, params.fee);
		_takeFirstHopInput(params.tokenIn, params.amountIn, pool);
		amountOut = UniswapV3Pool(pool).executeSwapExactInput(params.tokenIn, params.amountIn, recipient);
		require(amountOut >= params.amountOutMinimum, "INSUFFICIENT_OUTPUT_AMOUNT");
		_refundExcessNative(0);
	}

	function exactInput(ExactInputParams calldata params)
		external
		payable
		override
		returns (uint256 amountOut)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeForward(params.path);
		address recipient = params.recipient == address(0) ? msg.sender : params.recipient;
		uint256 currentAmount = params.amountIn;
		address firstPool = _poolFor(tokens[0], tokens[1], fees[0]);
		_takeFirstHopInput(tokens[0], currentAmount, firstPool);

		for (uint256 i = 0; i < fees.length; i++) {
			address pool = _poolFor(tokens[i], tokens[i + 1], fees[i]);
			address hopRecipient = i == fees.length - 1
				? recipient
				: _poolFor(tokens[i + 1], tokens[i + 2], fees[i + 1]);
			currentAmount = UniswapV3Pool(pool).executeSwapExactInput(tokens[i], currentAmount, hopRecipient);
		}

		amountOut = currentAmount;
		require(amountOut >= params.amountOutMinimum, "INSUFFICIENT_OUTPUT_AMOUNT");
		_refundExcessNative(0);
	}

	function exactOutputSingle(ExactOutputSingleParams calldata params)
		external
		payable
		override
		returns (uint256 amountIn)
	{
		address recipient = params.recipient == address(0) ? msg.sender : params.recipient;
		address pool = _poolFor(params.tokenIn, params.tokenOut, params.fee);
		amountIn = UniswapV3Pool(pool).quoteExactOutput(params.tokenOut, params.amountOut);
		require(amountIn <= params.amountInMaximum, "EXCESSIVE_INPUT_AMOUNT");
		_takeFirstHopInput(params.tokenIn, amountIn, pool);
		UniswapV3Pool(pool).executeSwapExactOutput(params.tokenOut, params.amountOut, recipient);
		_refundExcessNative(amountIn);
	}

	function exactOutput(ExactOutputParams calldata params)
		external
		payable
		override
		returns (uint256 amountIn)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeExactOutputToForward(params.path);
		address recipient = params.recipient == address(0) ? msg.sender : params.recipient;
		uint256 pools = fees.length;
		uint256[] memory requiredInputs = new uint256[](pools);
		uint256 desiredOutput = params.amountOut;

		for (uint256 i = pools; i > 0; i--) {
			address pool = _poolFor(tokens[i - 1], tokens[i], fees[i - 1]);
			requiredInputs[i - 1] = UniswapV3Pool(pool).quoteExactOutput(tokens[i], desiredOutput);
			desiredOutput = requiredInputs[i - 1];
		}

		amountIn = requiredInputs[0];
		require(amountIn <= params.amountInMaximum, "EXCESSIVE_INPUT_AMOUNT");

		address firstPool = _poolFor(tokens[0], tokens[1], fees[0]);
		_takeFirstHopInput(tokens[0], amountIn, firstPool);

		for (uint256 i = 0; i < pools; i++) {
			address pool = _poolFor(tokens[i], tokens[i + 1], fees[i]);
			uint256 hopOut = i == pools - 1 ? params.amountOut : requiredInputs[i + 1];
			address hopRecipient = i == pools - 1 ? recipient : _poolFor(tokens[i + 1], tokens[i + 2], fees[i + 1]);
			UniswapV3Pool(pool).executeSwapExactOutput(tokens[i + 1], hopOut, hopRecipient);
		}

		_refundExcessNative(amountIn);
	}

	function uniswapV3SwapCallback(int256, int256, bytes calldata) external pure override {
		revert("CALLBACK_NOT_USED");
	}

	function refundETH() external payable override {
		uint256 balance = address(this).balance;
		if (balance > 0) {
			MockSwapTransferHelper.safeTransferETH(msg.sender, balance);
		}
	}

	function unwrapWETH9(uint256 amountMinimum, address recipient) external payable override {
		uint256 wethBalance = ISwapERC20(WETH9).balanceOf(address(this));
		require(wethBalance >= amountMinimum, "INSUFFICIENT_WETH");
		ISwapWETH(WETH9).withdraw(wethBalance);
		MockSwapTransferHelper.safeTransferETH(recipient, wethBalance);
	}

	function sweepToken(address token, uint256 amountMinimum, address recipient) external payable override {
		uint256 balance = ISwapERC20(token).balanceOf(address(this));
		require(balance >= amountMinimum, "INSUFFICIENT_TOKEN");
		MockSwapTransferHelper.safeTransfer(token, recipient, balance);
	}

	function multicall(bytes[] calldata data) external payable override returns (bytes[] memory results) {
		results = new bytes[](data.length);
		for (uint256 i = 0; i < data.length; i++) {
			(bool success, bytes memory result) = address(this).delegatecall(data[i]);
			if (!success) {
				assembly {
					revert(add(result, 32), mload(result))
				}
			}
			results[i] = result;
		}
	}

	function _takeFirstHopInput(address tokenIn, uint256 amountIn, address pool) internal {
		if (msg.value > 0) {
			require(tokenIn == WETH9, "NATIVE_ONLY_FOR_WETH9");
			require(msg.value >= amountIn, "INSUFFICIENT_MSG_VALUE");
			ISwapWETH(WETH9).deposit{value: amountIn}();
			MockSwapTransferHelper.safeTransfer(WETH9, pool, amountIn);
			return;
		}

		MockSwapTransferHelper.safeTransferFrom(tokenIn, msg.sender, pool, amountIn);
	}

	function _refundExcessNative(uint256 spentAmount) internal {
		if (msg.value > spentAmount) {
			MockSwapTransferHelper.safeTransferETH(msg.sender, msg.value - spentAmount);
		}
	}

	function _poolFor(address tokenIn, address tokenOut, uint24 fee) internal view returns (address pool) {
		pool = ISwapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
		require(pool != address(0), "POOL_NOT_FOUND");
	}
}

contract Quoter is ISwapV3Quoter {
	address public immutable factory;

	constructor(address factory_) {
		factory = factory_;
	}

	function quoteExactInput(bytes memory path, uint256 amountIn)
		external
		view
		override
		returns (uint256 amountOut)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeForward(path);
		amountOut = amountIn;
		for (uint256 i = 0; i < fees.length; i++) {
			address pool = ISwapV3Factory(factory).getPool(tokens[i], tokens[i + 1], fees[i]);
			require(pool != address(0), "POOL_NOT_FOUND");
			amountOut = UniswapV3Pool(pool).quoteExactInput(tokens[i], amountOut);
		}
	}

	function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160)
		external
		view
		override
		returns (uint256 amountOut)
	{
		address pool = ISwapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
		require(pool != address(0), "POOL_NOT_FOUND");
		return UniswapV3Pool(pool).quoteExactInput(tokenIn, amountIn);
	}

	function quoteExactOutput(bytes memory path, uint256 amountOut)
		external
		view
		override
		returns (uint256 amountIn)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeExactOutputToForward(path);
		amountIn = amountOut;
		for (uint256 i = fees.length; i > 0; i--) {
			address pool = ISwapV3Factory(factory).getPool(tokens[i - 1], tokens[i], fees[i - 1]);
			require(pool != address(0), "POOL_NOT_FOUND");
			amountIn = UniswapV3Pool(pool).quoteExactOutput(tokens[i], amountIn);
		}
	}

	function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160)
		external
		view
		override
		returns (uint256 amountIn)
	{
		address pool = ISwapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
		require(pool != address(0), "POOL_NOT_FOUND");
		return UniswapV3Pool(pool).quoteExactOutput(tokenOut, amountOut);
	}
}

contract QuoterV2 is ISwapV3QuoterV2 {
	address public immutable factory;

	constructor(address factory_) {
		factory = factory_;
	}

	function quoteExactInput(bytes memory path, uint256 amountIn)
		external
		view
		override
		returns (
			uint256 amountOut,
			uint160[] memory sqrtPriceX96AfterList,
			uint32[] memory initializedTicksCrossedList,
			uint256 gasEstimate
		)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeForward(path);
		sqrtPriceX96AfterList = new uint160[](fees.length);
		initializedTicksCrossedList = new uint32[](fees.length);
		amountOut = amountIn;
		for (uint256 i = 0; i < fees.length; i++) {
			address pool = ISwapV3Factory(factory).getPool(tokens[i], tokens[i + 1], fees[i]);
			require(pool != address(0), "POOL_NOT_FOUND");
			amountOut = UniswapV3Pool(pool).quoteExactInput(tokens[i], amountOut);
			(uint160 sqrtPriceX96,,,,,,) = ISwapV3Pool(pool).slot0();
			sqrtPriceX96AfterList[i] = sqrtPriceX96;
			initializedTicksCrossedList[i] = 0;
		}
		gasEstimate = 0;
	}

	function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160)
		external
		view
		override
		returns (
			uint256 amountOut,
			uint160 sqrtPriceX96After,
			uint32 initializedTicksCrossed,
			uint256 gasEstimate
		)
	{
		address pool = ISwapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
		require(pool != address(0), "POOL_NOT_FOUND");
		amountOut = UniswapV3Pool(pool).quoteExactInput(tokenIn, amountIn);
		(sqrtPriceX96After,,,,,,) = ISwapV3Pool(pool).slot0();
		initializedTicksCrossed = 0;
		gasEstimate = 0;
	}

	function quoteExactOutput(bytes memory path, uint256 amountOut)
		external
		view
		override
		returns (
			uint256 amountIn,
			uint160[] memory sqrtPriceX96AfterList,
			uint32[] memory initializedTicksCrossedList,
			uint256 gasEstimate
		)
	{
		(address[] memory tokens, uint24[] memory fees) = MockSwapV3Path.decodeExactOutputToForward(path);
		sqrtPriceX96AfterList = new uint160[](fees.length);
		initializedTicksCrossedList = new uint32[](fees.length);
		amountIn = amountOut;
		for (uint256 i = fees.length; i > 0; i--) {
			address pool = ISwapV3Factory(factory).getPool(tokens[i - 1], tokens[i], fees[i - 1]);
			require(pool != address(0), "POOL_NOT_FOUND");
			amountIn = UniswapV3Pool(pool).quoteExactOutput(tokens[i], amountIn);
			(uint160 sqrtPriceX96,,,,,,) = ISwapV3Pool(pool).slot0();
			sqrtPriceX96AfterList[i - 1] = sqrtPriceX96;
			initializedTicksCrossedList[i - 1] = 0;
		}
		gasEstimate = 0;
	}

	function quoteExactOutputSingle(address tokenIn, address tokenOut, uint256 amountOut, uint24 fee, uint160)
		external
		view
		override
		returns (
			uint256 amountIn,
			uint160 sqrtPriceX96After,
			uint32 initializedTicksCrossed,
			uint256 gasEstimate
		)
	{
		address pool = ISwapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
		require(pool != address(0), "POOL_NOT_FOUND");
		amountIn = UniswapV3Pool(pool).quoteExactOutput(tokenOut, amountOut);
		(sqrtPriceX96After,,,,,,) = ISwapV3Pool(pool).slot0();
		initializedTicksCrossed = 0;
		gasEstimate = 0;
	}
}

contract NonfungiblePositionManager is ISwapV3PositionManager {
	address public immutable override factory;
	address public immutable override WETH9;
	uint256 public nextTokenId = 1;

	struct PositionState {
		uint96 nonce;
		address operator;
		address token0;
		address token1;
		uint24 fee;
		int24 tickLower;
		int24 tickUpper;
		uint128 liquidity;
		uint256 feeGrowthInside0LastX128;
		uint256 feeGrowthInside1LastX128;
		uint128 tokensOwed0;
		uint128 tokensOwed1;
		address pool;
	}

	mapping(uint256 => PositionState) private _positions;

	constructor(address factory_, address weth9_) {
		factory = factory_;
		WETH9 = weth9_;
	}

	receive() external payable {}

	function positions(uint256 tokenId)
		external
		view
		override
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
		)
	{
		PositionState memory position = _positions[tokenId];
		return (
			position.nonce,
			position.operator,
			position.token0,
			position.token1,
			position.fee,
			position.tickLower,
			position.tickUpper,
			position.liquidity,
			position.feeGrowthInside0LastX128,
			position.feeGrowthInside1LastX128,
			position.tokensOwed0,
			position.tokensOwed1
		);
	}

	function mint(MintParams calldata params)
		external
		payable
		override
		returns (uint256 tokenId, uint128 addedLiquidity, uint256 amount0, uint256 amount1)
	{
		address pool = _getOrCreatePool(params.token0, params.token1, params.fee);
		address poolToken0 = ISwapV3Pool(pool).token0();
		(bool sameOrder, uint256 orderedAmount0, uint256 orderedAmount1) = _normalizeAmounts(
			params.token0,
			params.token1,
			poolToken0,
			params.amount0Desired,
			params.amount1Desired
		);
		_takeLiquidityInputs(params.token0, params.token1, params.amount0Desired, params.amount1Desired, pool);
		addedLiquidity = UniswapV3Pool(pool).provideLiquidity(orderedAmount0, orderedAmount1);
		tokenId = nextTokenId++;
		_positions[tokenId] = PositionState({
			nonce: 0,
			operator: msg.sender,
			token0: sameOrder ? params.token0 : params.token1,
			token1: sameOrder ? params.token1 : params.token0,
			fee: params.fee,
			tickLower: params.tickLower,
			tickUpper: params.tickUpper,
			liquidity: addedLiquidity,
			feeGrowthInside0LastX128: 0,
			feeGrowthInside1LastX128: 0,
			tokensOwed0: 0,
			tokensOwed1: 0,
			pool: pool
		});
		amount0 = orderedAmount0;
		amount1 = orderedAmount1;
		_refundExcessNative(_nativeSpent(params.token0, params.token1, params.amount0Desired, params.amount1Desired));
	}

	function increaseLiquidity(IncreaseLiquidityParams calldata params)
		external
		payable
		override
		returns (uint128 addedLiquidity, uint256 amount0, uint256 amount1)
	{
		PositionState storage position = _positions[params.tokenId];
		require(position.operator == msg.sender, "NOT_POSITION_OWNER");
		_takeLiquidityInputs(position.token0, position.token1, params.amount0Desired, params.amount1Desired, position.pool);
		addedLiquidity = UniswapV3Pool(position.pool).provideLiquidity(params.amount0Desired, params.amount1Desired);
		position.liquidity += addedLiquidity;
		position.nonce += 1;
		amount0 = params.amount0Desired;
		amount1 = params.amount1Desired;
		_refundExcessNative(_nativeSpent(position.token0, position.token1, params.amount0Desired, params.amount1Desired));
	}

	function decreaseLiquidity(DecreaseLiquidityParams calldata params)
		external
		payable
		override
		returns (uint256 amount0, uint256 amount1)
	{
		PositionState storage position = _positions[params.tokenId];
		require(position.operator == msg.sender, "NOT_POSITION_OWNER");
		require(position.liquidity >= params.liquidity, "INSUFFICIENT_LIQUIDITY");
		(amount0, amount1) = UniswapV3Pool(position.pool).removeLiquidity(msg.sender, params.liquidity);
		position.liquidity -= params.liquidity;
		position.nonce += 1;
	}

	function collect(CollectParams calldata params)
		external
		payable
		override
		returns (uint256 amount0, uint256 amount1)
	{
		PositionState storage position = _positions[params.tokenId];
		require(position.operator == msg.sender, "NOT_POSITION_OWNER");
		amount0 = position.tokensOwed0 > params.amount0Max ? params.amount0Max : position.tokensOwed0;
		amount1 = position.tokensOwed1 > params.amount1Max ? params.amount1Max : position.tokensOwed1;
		position.tokensOwed0 -= uint128(amount0);
		position.tokensOwed1 -= uint128(amount1);
		if (amount0 > 0) {
			MockSwapTransferHelper.safeTransfer(position.token0, params.recipient, amount0);
		}
		if (amount1 > 0) {
			MockSwapTransferHelper.safeTransfer(position.token1, params.recipient, amount1);
		}
	}

	function burn(uint256 tokenId) external payable override {
		PositionState memory position = _positions[tokenId];
		require(position.operator == msg.sender, "NOT_POSITION_OWNER");
		require(position.liquidity == 0, "LIQUIDITY_NOT_ZERO");
		require(position.tokensOwed0 == 0 && position.tokensOwed1 == 0, "TOKENS_OWED");
		delete _positions[tokenId];
	}

	function refundETH() external payable override {
		uint256 balance = address(this).balance;
		if (balance > 0) {
			MockSwapTransferHelper.safeTransferETH(msg.sender, balance);
		}
	}

	function unwrapWETH9(uint256 amountMinimum, address recipient) external payable override {
		uint256 wethBalance = ISwapERC20(WETH9).balanceOf(address(this));
		require(wethBalance >= amountMinimum, "INSUFFICIENT_WETH");
		ISwapWETH(WETH9).withdraw(wethBalance);
		MockSwapTransferHelper.safeTransferETH(recipient, wethBalance);
	}

	function sweepToken(address token, uint256 amountMinimum, address recipient) external payable override {
		uint256 balance = ISwapERC20(token).balanceOf(address(this));
		require(balance >= amountMinimum, "INSUFFICIENT_TOKEN");
		MockSwapTransferHelper.safeTransfer(token, recipient, balance);
	}

	function multicall(bytes[] calldata data) external payable override returns (bytes[] memory results) {
		results = new bytes[](data.length);
		for (uint256 i = 0; i < data.length; i++) {
			(bool success, bytes memory result) = address(this).delegatecall(data[i]);
			if (!success) {
				assembly {
					revert(add(result, 32), mload(result))
				}
			}
			results[i] = result;
		}
	}

	function createAndInitializePoolIfNecessary(address tokenA, address tokenB, uint24 fee, uint160 sqrtPriceX96)
		external
		returns (address pool)
	{
		pool = _getOrCreatePool(tokenA, tokenB, fee);
		(uint160 currentPrice,,,,,,) = ISwapV3Pool(pool).slot0();
		if (currentPrice == 0) {
			ISwapV3Pool(pool).initialize(sqrtPriceX96 == 0 ? uint160(1 << 96) : sqrtPriceX96);
		}
	}

	function _getOrCreatePool(address tokenA, address tokenB, uint24 fee) internal returns (address pool) {
		pool = ISwapV3Factory(factory).getPool(tokenA, tokenB, fee);
		if (pool == address(0)) {
			pool = ISwapV3Factory(factory).createPool(tokenA, tokenB, fee);
		}
		(uint160 currentPrice,,,,,,) = ISwapV3Pool(pool).slot0();
		if (currentPrice == 0) {
			ISwapV3Pool(pool).initialize(uint160(1 << 96));
		}
	}

	function _takeLiquidityInputs(address tokenA, address tokenB, uint256 amountA, uint256 amountB, address pool) internal {
		uint256 valueUsed;
		if (tokenA == WETH9 && msg.value >= amountA) {
			ISwapWETH(WETH9).deposit{value: amountA}();
			MockSwapTransferHelper.safeTransfer(WETH9, pool, amountA);
			valueUsed += amountA;
		} else if (amountA > 0) {
			MockSwapTransferHelper.safeTransferFrom(tokenA, msg.sender, pool, amountA);
		}

		if (tokenB == WETH9 && msg.value >= valueUsed + amountB) {
			ISwapWETH(WETH9).deposit{value: amountB}();
			MockSwapTransferHelper.safeTransfer(WETH9, pool, amountB);
			valueUsed += amountB;
		} else if (amountB > 0) {
			MockSwapTransferHelper.safeTransferFrom(tokenB, msg.sender, pool, amountB);
		}
	}

	function _nativeSpent(address tokenA, address tokenB, uint256 amountA, uint256 amountB) internal view returns (uint256 spent) {
		if (tokenA == WETH9) {
			spent += amountA;
		}
		if (tokenB == WETH9) {
			spent += amountB;
		}
	}

	function _refundExcessNative(uint256 spentAmount) internal {
		if (msg.value > spentAmount) {
			MockSwapTransferHelper.safeTransferETH(msg.sender, msg.value - spentAmount);
		}
	}

	function _normalizeAmounts(
		address tokenA,
		address tokenB,
		address poolToken0,
		uint256 amountA,
		uint256 amountB
	) internal pure returns (bool sameOrder, uint256 orderedAmount0, uint256 orderedAmount1) {
		sameOrder = tokenA == poolToken0;
		if (sameOrder) {
			return (true, amountA, amountB);
		}
		require(tokenB == poolToken0, "POOL_TOKEN_MISMATCH");
		return (false, amountB, amountA);
	}
}
