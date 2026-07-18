import { createC2pa, type C2paSdk, type ManifestStore } from "@contentauth/c2pa-web";
import wasmSrc from "@contentauth/c2pa-web/resources/c2pa.wasm?url";

export type C2paState =
	| { status: "loading" }
	| { status: "done"; store: ManifestStore | null }
	| { status: "error" };

let sdk: Promise<C2paSdk> | null = null;

function getSdk(): Promise<C2paSdk> {
	if (!sdk) {
		sdk = createC2pa({ wasmSrc }).catch((err) => {
			sdk = null;
			throw err;
		});
	}
	return sdk;
}

/** Kicks off fetching and compiling the C2PA WASM module ahead of time, so it's warm by the time a file is read. */
export function preloadC2pa(): void {
	getSdk().catch((err) => console.warn("Could not preload C2PA SDK", err));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("Timed out reading C2PA manifest")), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/** Reads the C2PA (Content Credentials) manifest store from a file, if one is embedded. */
export async function readC2paManifestStore(file: File): Promise<ManifestStore | null> {
	return withTimeout(
		(async () => {
			const c2pa = await getSdk();
			const reader = await c2pa.reader.fromBlob(file.type, file, {
				verify: { verifyTrust: false },
				cawgTrust: { verifyTrustList: false },
			});
			if (!reader) return null;
			try {
				return await reader.manifestStore();
			} finally {
				await reader.free();
			}
		})(),
		60_000,
	);
}
