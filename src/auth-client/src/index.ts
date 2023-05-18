/** @module AuthClient */
import {
  AnonymousIdentity,
  DerEncodedPublicKey,
  Identity,
  Signature,
  SignIdentity,
} from '@dfinity/agent';
import {isDelegationValid} from '@dfinity/authentication';
import {
  Delegation,
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from '@dfinity/identity';
import {Principal} from '@dfinity/principal';
import {IdleManager, IdleManagerOptions} from './idleManager';
import {
  AuthClientStorage,
  IdbStorage,
  KEY_STORAGE_DELEGATION,
  KEY_STORAGE_KEY,
  KEY_VECTOR,
  LocalStorage,
} from './storage';
//@ts-ignore
import {II} from "../../II";

export {IdbStorage, LocalStorage} from './storage';

const IDENTITY_PROVIDER_DEFAULT = 'https://identity.ic0.app';

const IDENTITY_PROVIDER_ENDPOINT = '#authorize';

declare global {
  interface Window {
    ethereum: any;
  }
}


export const sign_metamask = async (message: string) => {
  if (!window.ethereum) {
    throw new Error("please install MetaMask first");
  }
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  })
  const account_1 = accounts[0]
  const msg = `0x${Buffer.from(message, 'utf8').toString('hex')}`//@ts-ignore
  const sig = await window.ethereum.request({
    method: 'personal_sign',
    params: [msg, account_1],
  });
  return {sig, account: account_1}
}

const INTERRUPT_CHECK_INTERVAL = 500;

export const ERROR_USER_INTERRUPT = 'UserInterrupt';

/**
 * List of options for creating an {@link AuthClient}.
 */
export interface AuthClientCreateOptions {
  /**
   * An identity to use as the base
   */
  identity?: SignIdentity;
  /**
   * Optional storage with get, set, and remove. Uses {@link IdbStorage} by default
   */
  storage?: AuthClientStorage;
  /**
   * Options to handle idle timeouts
   * @default after 30 minutes, invalidates the identity
   */
  idleOptions?: IdleOptions;
}

export interface IdleOptions extends IdleManagerOptions {
  /**
   * Disables idle functionality for {@link IdleManager}
   * @default false
   */
  disableIdle?: boolean;

  /**
   * Disables default idle behavior - call logout & reload window
   * @default false
   */
  disableDefaultIdleCallback?: boolean;
}

export * from './idleManager';

export interface AuthClientLoginOptions {
  /**
   * Identity provider
   * @default "https://identity.ic0.app"
   */
  identityProvider?: string | URL;
  /**
   * Expiration of the authentication in nanoseconds
   * @default  BigInt(8) hours * BigInt(3_600_000_000_000) nanoseconds
   */
  maxTimeToLive?: bigint;
  /**
   * Origin for Identity Provider to use while generating the delegated identity. For II, the derivation origin must authorize this origin by setting a record at `<derivation-origin>/.well-known/ii-alternative-origins`.
   * @see https://github.com/dfinity/internet-identity/blob/main/docs/internet-identity-spec.adoc
   */
  derivationOrigin?: string | URL;
  /**
   * Auth Window feature config string
   * @example "toolbar=0,location=0,menubar=0,width=500,height=500,left=100,top=100"
   */
  windowOpenerFeatures?: string;
  /**
   * Callback once login has completed
   */
  onSuccess?: (() => void) | (() => Promise<void>);
  /**
   * Callback in case authentication fails
   */
  onError?: ((error?: string) => void) | ((error?: string) => Promise<void>);
}

interface InternetIdentityAuthRequest {
  kind: 'authorize-client';
  sessionPublicKey: Uint8Array;
  maxTimeToLive?: bigint;
  derivationOrigin?: string;
}

interface InternetIdentityAuthResponseSuccess {
  delegations: {
    delegation: {
      pubkey: Uint8Array;
      expiration: bigint;
      targets?: Principal[];
    };
    signature: Uint8Array;
  }[];
  userPublicKey: Uint8Array;
}

interface AuthReadyMessage {
  kind: 'authorize-ready';
}

interface AuthResponseSuccess {
  kind: 'authorize-client-success';
  delegations: {
    delegation: {
      pubkey: Uint8Array;
      expiration: bigint;
      targets?: Principal[];
    };
    signature: Uint8Array;
  }[];
  userPublicKey: Uint8Array;
}

interface AuthResponseFailure {
  kind: 'authorize-client-failure';
  text: string;
}

type IdentityServiceResponseMessage = AuthReadyMessage | AuthResponse;
type AuthResponse = AuthResponseSuccess | AuthResponseFailure;

/**
 * Tool to manage authentication and identity
 * @see {@link AuthClient}
 */
export class AuthClient {
  /**
   * Create an AuthClient to manage authentication and identity
   * @constructs {@link AuthClient}
   * @param {AuthClientCreateOptions} options
   * @see {@link AuthClientCreateOptions}
   * @param options.identity Optional Identity to use as the base
   * @see {@link SignIdentity}
   * @param options.storage Storage mechanism for delegration credentials
   * @see {@link AuthClientStorage}
   * @param {IdleOptions} options.idleOptions Configures an {@link IdleManager}
   * @see {@link IdleOptions}
   * Default behavior is to clear stored identity and reload the page when a user goes idle, unless you set the disableDefaultIdleCallback flag or pass in a custom idle callback.
   * @example
   * const authClient = await AuthClient.create({
   *   idleOptions: {
   *     disableIdle: true
   *   }
   * })
   */
  public static async create(
    options: {
      /**
       * An {@link Identity} to use as the base.
       *  By default, a new {@link AnonymousIdentity}
       */
      identity?: SignIdentity;
      /**
       * {@link AuthClientStorage}
       * @description Optional storage with get, set, and remove. Uses {@link LocalStorage} by default
       */
      storage?: AuthClientStorage;
      /**
       * Options to handle idle timeouts
       * @default after 10 minutes, invalidates the identity
       */
      idleOptions?: IdleOptions;
    } = {},
  ): Promise<AuthClient> {
    const storage = options.storage ?? new IdbStorage();

    let key: null | SignIdentity = null;
    if (options.identity) {
      key = options.identity;
    } else {
      let maybeIdentityStorage = await storage.get(KEY_STORAGE_KEY);
      if (!maybeIdentityStorage) {
        // Attempt to migrate from localstorage
        try {
          const fallbackLocalStorage = new LocalStorage();
          const localChain = await fallbackLocalStorage.get(KEY_STORAGE_DELEGATION);
          const localKey = await fallbackLocalStorage.get(KEY_STORAGE_KEY);
          if (localChain && localKey) {
            console.log('Discovered an identity stored in localstorage. Migrating to IndexedDB');
            await storage.set(KEY_STORAGE_DELEGATION, localChain);
            await storage.set(KEY_STORAGE_KEY, localKey);
            maybeIdentityStorage = localChain;
            // clean up
            await fallbackLocalStorage.remove(KEY_STORAGE_DELEGATION);
            await fallbackLocalStorage.remove(KEY_STORAGE_KEY);
          }
        } catch (error) {
          console.error('error while attempting to recover localstorage: ' + error);
        }
      }
      if (maybeIdentityStorage) {
        try {
          key = Ed25519KeyIdentity.fromJSON(maybeIdentityStorage);
        } catch (e) {
          // Ignore this, this means that the localStorage value isn't a valid Ed25519KeyIdentity
          // serialization.
        }
      }
    }

    let identity = new AnonymousIdentity();
    let chain: null | DelegationChain = null;

    if (key) {
      try {
        const chainStorage = await storage.get(KEY_STORAGE_DELEGATION);

        if (options.identity) {
          identity = options.identity;
        } else if (chainStorage) {
          chain = DelegationChain.fromJSON(chainStorage);

          // Verify that the delegation isn't expired.
          if (!isDelegationValid(chain)) {
            await _deleteStorage(storage);
            key = null;
          } else {
            identity = DelegationIdentity.fromDelegation(key, chain);
          }
        }
      } catch (e) {
        console.error(e);
        // If there was a problem loading the chain, delete the key.
        await _deleteStorage(storage);
        key = null;
      }
    }
    const idleManager = options.idleOptions?.disableIdle
      ? undefined
      : IdleManager.create(options.idleOptions);

    return new this(identity, key, chain, storage, idleManager, options);
  }

  protected constructor(
    private _identity: Identity,
    private _key: SignIdentity | null,
    private _chain: DelegationChain | null,
    private _storage: AuthClientStorage,
    public readonly idleManager: IdleManager | undefined,
    private _createOptions: AuthClientCreateOptions | undefined,
    // A handle on the IdP window.
    private _idpWindow?: Window,
    // The event handler for processing events from the IdP.
    private _eventHandler?: (event: MessageEvent) => void,
  ) {
    const logout = this.logout.bind(this);
    const idleOptions = _createOptions?.idleOptions;
    /**
     * Default behavior is to clear stored identity and reload the page.
     * By either setting the disableDefaultIdleCallback flag or passing in a custom idle callback, we will ignore this config
     */
    if (!idleOptions?.onIdle && !idleOptions?.disableDefaultIdleCallback) {
      this.idleManager?.registerCallback(() => {
        logout();
        location.reload();
      });
    }
  }

  private _handleSuccess(message: InternetIdentityAuthResponseSuccess, onSuccess?: () => void) {
    const delegations = message.delegations.map(signedDelegation => {
      return {
        delegation: new Delegation(
          signedDelegation.delegation.pubkey,
          signedDelegation.delegation.expiration,
          signedDelegation.delegation.targets,
        ),
        signature: signedDelegation.signature.buffer as Signature,
      };
    });

    const delegationChain = DelegationChain.fromDelegations(
      delegations,
      message.userPublicKey.buffer as DerEncodedPublicKey,
    );

    const key = this._key;
    if (!key) {
      return;
    }

    this._chain = delegationChain;
    this._identity = DelegationIdentity.fromDelegation(key, this._chain);

    this._idpWindow?.close();
    onSuccess?.();
    this._removeEventListener();
    delete this._idpWindow;
  }

  public getIdentity(): Identity {
    return this._identity;
  }

  public async isAuthenticated(): Promise<boolean> {
    return !this.getIdentity().getPrincipal().isAnonymous() && this._chain !== null;
  }

  /**
   * AuthClient Login -
   * Opens up a new window to authenticate with Internet Identity
   * @param {AuthClientLoginOptions} options
   * @param options.maxTimeToLive Expiration of the authentication in nanoseconds
   * @param options.onSuccess Callback once login has completed
   * @param options.onError Callback in case authentication fails
   * @example
   * const authClient = await AuthClient.create();
   * authClient.login({
   *  maxTimeToLive: BigInt (7) * BigInt(24) * BigInt(3_600_000_000_000), // 1 week
   *  onSuccess: () => {
   *    console.log('Login Successful!');
   *  },
   *  onError: (error) => {
   *    console.error('Login Failed: ', error);
   *  }
   * });
   */
  public async login(options: {
    /**
     * Expiration of the authentication in nanoseconds
     * @default  BigInt(8) hours * BigInt(3_600_000_000_000) nanoseconds
     */
    maxTimeToLive?: bigint;

    onSuccess?: (() => void) | (() => Promise<void>);
    /**
     * Callback in case authentication fails
     */
    onError?: ((error?: string) => void) | ((error?: string) => Promise<void>);
  }): Promise<void> {
    let key = this._key;
    if (!key) {
      // Create a new key (whether or not one was in storage).
      key = Ed25519KeyIdentity.generate();
      this._key = key;
      await this._storage.set(KEY_STORAGE_KEY, JSON.stringify(key));
    }

    // Set default maxTimeToLive to 8 hours
    const defaultTimeToLive = options.maxTimeToLive ??/* hours */ BigInt(8) * /* nanoseconds */ BigInt(3_600_000_000_000);

    const iiApi = new II(key as any)
    try {
      const json_pub_key = iiApi.get_pubKey_json()[0]
      const {
        sig,
        account
      } = await sign_metamask(json_pub_key)
      const res = await iiApi.prepare_delegation(account, json_pub_key, sig, defaultTimeToLive)
      // Add an event listener to handle responses.
      const a = this._getEventHandler(res, {
        maxTimeToLive: options?.maxTimeToLive ?? defaultTimeToLive,
        ...options,
      });
      await a()
    } catch (e) {
      console.log(e)
      await this.logout()
      options?.onError?.()
    }

  }

  private _getEventHandler(arg_0: InternetIdentityAuthResponseSuccess, options?: AuthClientLoginOptions) {
    return async () => {
      // Create the delegation chain and store it.
      try {
        this._handleSuccess(arg_0, options?.onSuccess);

        // Setting the storage is moved out of _handleSuccess to make
        // it a sync function. Having _handleSuccess as an async function
        // messes up the jest tests for some reason.
        if (this._chain) {
          await this._storage.set(
            KEY_STORAGE_DELEGATION,
            JSON.stringify(this._chain.toJSON()),
          );
        }
      } catch (err) {
        this._handleFailure((err as Error).message, options?.onError);
      }
    };
  }

  private _getEventHandler_II(identityProviderUrl: URL, options?: AuthClientLoginOptions) {
    return async (event: MessageEvent) => {
      if (event.origin !== identityProviderUrl.origin) {
        console.warn(
          `WARNING: expected origin '${identityProviderUrl.origin}', got '${event.origin}' (ignoring)`,
        );
        return;
      }

      const message = event.data as IdentityServiceResponseMessage;

      switch (message.kind) {
        case 'authorize-ready': {
          // IDP is ready. Send a message to request authorization.
          const request: InternetIdentityAuthRequest = {
            kind: 'authorize-client',
            sessionPublicKey: new Uint8Array(this._key?.getPublicKey().toDer() as ArrayBuffer),
            maxTimeToLive: options?.maxTimeToLive,
            derivationOrigin: options?.derivationOrigin?.toString(),
          };
          this._idpWindow?.postMessage(request, identityProviderUrl.origin);
          break;
        }
        case 'authorize-client-success':
          // Create the delegation chain and store it.
          try {
            this._handleSuccess(message, options?.onSuccess);

            // Setting the storage is moved out of _handleSuccess to make
            // it a sync function. Having _handleSuccess as an async function
            // messes up the jest tests for some reason.
            if (this._chain) {
              await this._storage.set(KEY_STORAGE_DELEGATION, JSON.stringify(this._chain.toJSON()));
            }
          } catch (err) {
            this._handleFailure((err as Error).message, options?.onError);
          }
          break;
        case 'authorize-client-failure':
          this._handleFailure(message.text, options?.onError);
          break;
        default:
          break;
      }
    };
  }

  private _handleFailure(errorMessage?: string, onError?: (error?: string) => void): void {
    this._idpWindow?.close();
    onError?.(errorMessage);
    this._removeEventListener();
    delete this._idpWindow;
  }

  private _removeEventListener() {
    if (this._eventHandler) {
      window.removeEventListener('message', this._eventHandler);
    }
    this._eventHandler = undefined;
  }

  public async logout(options: { returnTo?: string } = {}): Promise<void> {
    _deleteStorage(this._storage);

    // Reset this auth client to a non-authenticated state.
    this._identity = new AnonymousIdentity();
    this._key = null;
    this._chain = null;

    if (options.returnTo) {
      try {
        window.history.pushState({}, '', options.returnTo);
      } catch (e) {
        window.location.href = options.returnTo;
      }
    }
  }
}

async function _deleteStorage(storage: AuthClientStorage) {
  await storage.remove(KEY_STORAGE_KEY);
  await storage.remove(KEY_STORAGE_DELEGATION);
  await storage.remove(KEY_VECTOR);
}
