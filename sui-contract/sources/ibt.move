module ibt_token::ibt {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::url;

    /// the IBT token type
    public struct IBT has drop {}

    /// initialize the IBT token
    fun init(witness: IBT, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9, // decimals (9 like SUI, not 18 like ETH, to fit in u64)
            b"IBT", // symbol
            b"Inter Blockchain Token", // name
            b"Token for blockchain bridge", // description
            option::some(url::new_unsafe_from_bytes(b"https://example.com/ibt.png")),
            ctx
        );
        
        // transfer the treasury cap to the sender (deployer)
        transfer::public_transfer(treasury, tx_context::sender(ctx));
        
        // freeze the metadata object
        transfer::public_freeze_object(metadata);
    }

    /// mint new IBT tokens
    public entry fun mint(
        treasury: &mut TreasuryCap<IBT>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// burn IBT tokens
    public entry fun burn(
        treasury: &mut TreasuryCap<IBT>,
        coin: Coin<IBT>
    ) {
        coin::burn(treasury, coin);
    }
}