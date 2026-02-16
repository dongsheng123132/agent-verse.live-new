
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateInitialGrid } from '@/lib/gridGenerator';
import { GRID_SIZE } from '@/constants';

// Vercel Configuration: Allow up to 60 seconds for execution
// This is critical for the initial seed of 10,000 items.
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Check existing data count
        const count = await prisma.gridCell.count();
        const expectedSize = GRID_SIZE; // 10,000

        console.log(`[GRID] Database check: ${count}/${expectedSize} cells found.`);

        // 2. Data Integrity Check & Auto-Healing
        // If count is less than expected (e.g. 2000), it means a previous deployment timed out.
        // We MUST wipe and re-seed to ensure the map is complete and contiguous.
        if (count < expectedSize) {
            console.log(`[SEED] Database incomplete. Starting Batched Initialization...`);
            
            // Step A: Wipe partial data
            if (count > 0) {
                console.log(`[SEED] Wiping ${count} partial records...`);
                await prisma.gridCell.deleteMany({});
            }

            // Step B: Generate 10k items in memory
            const seedData = generateInitialGrid();
            
            // Step C: BATCH INSERT (Crucial for Vercel)
            // Inserting 10000 rows at once = Timeout.
            // We split into chunks of 500.
            const BATCH_SIZE = 500;
            const totalBatches = Math.ceil(seedData.length / BATCH_SIZE);

            console.log(`[SEED] Inserting ${seedData.length} cells in ${totalBatches} batches...`);

            for (let i = 0; i < seedData.length; i += BATCH_SIZE) {
                const batch = seedData.slice(i, i + BATCH_SIZE);
                
                await prisma.gridCell.createMany({
                    data: batch.map(cell => ({
                        id: cell.id,
                        x: cell.x,
                        y: cell.y,
                        owner: cell.owner,
                        price: cell.price,
                        isForSale: cell.isForSale,
                        status: cell.status,
                        color: cell.color,
                        image: cell.image,
                        isMegaNodeStart: cell.isMegaNodeStart || false,
                        isMegaNodeMember: cell.isMegaNodeMember || false,
                        megaBlockSize: cell.megaBlockSize,
                        agentData: cell.agentData ? JSON.parse(JSON.stringify(cell.agentData)) : null
                    })),
                    skipDuplicates: true, 
                });
                // Small delay to let the database breathe (optional but helpful for weak DBs)
                // await new Promise(r => setTimeout(r, 50)); 
                console.log(`[SEED] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches} inserted.`);
            }
            console.log("[SEED] Initialization complete.");
        }

        // 3. Fetch Data (Optimized)
        // We select all fields. 10k rows is about 3-4MB JSON. 
        // Vercel limit is 4.5MB. This is close but usually safe with compression.
        const cells = await prisma.gridCell.findMany({
            orderBy: { id: 'asc' }
        });
        
        return NextResponse.json(cells);
    } catch (error) {
        console.error("[API ERROR] Grid fetch failed:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" }, 
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { cellIds, agentData, status, isForSale, price } = body;

        if (!cellIds || !Array.isArray(cellIds)) {
             return NextResponse.json({ error: "Invalid cellIds" }, { status: 400 });
        }

        const updateResult = await prisma.gridCell.updateMany({
            where: {
                id: { in: cellIds }
            },
            data: {
                agentData: agentData, 
                status: status,
                isForSale: isForSale,
                price: price,
            }
        });

        return NextResponse.json({ success: true, count: updateResult.count });

    } catch (error) {
         console.error("[API ERROR] Update failed:", error);
         return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
