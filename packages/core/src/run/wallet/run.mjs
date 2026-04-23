
import {walletList} from "./wallet-list.mjs"
import { extractData } from "../../modules/data-engine/index.mjs"

import {unlockWallets} from "./unlock.mjs"

export async function run({
    network,
    wallet,
    confirm,
    interact,
    args
}) {
    const name = "h"
    const listed = await walletList()
    console.table(
        listed.items.map(v => v.shortName)
    )
    const matched = extractData({
        input: { items: listed.items },
        sourcePath: "items[*]",
        filters: [
            { field: "shortName", op: "contains", value: name },
        ],
    })

    console.log(
        {
            filterByName: name,
            total: listed.total,
            matched,
        }
    )
     

}