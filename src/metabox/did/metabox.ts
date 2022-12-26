export const idlFactory = ({IDL}) => {
  const Branch = IDL.Rec();
  const List = IDL.Rec();
  const Error = IDL.Variant({
    'NoFreeBoxNum': IDL.Null,
    'NoUnBoundOg': IDL.Null,
    'Named': IDL.Null,
    'NoBox': IDL.Null,
    'DataBoxNotExist': IDL.Null,
    'OnlyDataBoxCanDeleted': IDL.Null,
    'BalanceNotEnough': IDL.Null,
    'NameRepeat': IDL.Null,
    'UnAuthorized': IDL.Null,
    'DataBoxEnough': IDL.Null,
    'DataBoxNotShareTo': IDL.Null,
    'CreateBoxOnWay': IDL.Null,
    'SomethingErr': IDL.Null,
    'LedgerTransferError': IDL.Nat,
    'Invalid_Operation': IDL.Null,
    'NotBoxOwner': IDL.Null,
    'NoProfile': IDL.Null,
    'ProfileEnough': IDL.Null,
    'NotifyCreateError': IDL.Nat,
  });
  const Result = IDL.Variant({'ok': IDL.Null, 'err': Error});
  const BurnError = IDL.Variant({
    'InsufficientBalance': IDL.Null,
    'InvalidTokenContract': IDL.Null,
    'NotSufficientLiquidity': IDL.Null,
  });
  const RustResult = IDL.Variant({'Ok': IDL.Nat64, 'Err': BurnError});
  const BoxType = IDL.Variant({
    'xid': IDL.Null,
    'data_box': IDL.Null,
    'profile': IDL.Null,
  });
  const BoxMetadata = IDL.Record({
    'is_private': IDL.Bool,
    'box_name': IDL.Text,
    'box_type': BoxType,
  });
  const CreateBoxArgs = IDL.Record({'metadata': BoxMetadata});
  const Result_6 = IDL.Variant({'ok': IDL.Principal, 'err': Error});
  const DelBoxArgs = IDL.Record({
    'cycleTo': IDL.Opt(IDL.Principal),
    'box_type': BoxType,
    'canisterId': IDL.Principal,
  });
  const Result_5 = IDL.Variant({'ok': IDL.Text, 'err': Error});
  const BoxStatus = IDL.Variant({'stopped': IDL.Null, 'running': IDL.Null});
  const BoxState = IDL.Record({
    'status': BoxStatus,
    'owner': IDL.Principal,
    'avatar_key': IDL.Text,
    'is_private': IDL.Bool,
    'box_name': IDL.Text,
    'box_type': BoxType,
  });
  const Result_4 = IDL.Variant({'ok': BoxState, 'err': Error});
  const BoxAllInfo = IDL.Record({
    'status': BoxStatus,
    'owner': IDL.Principal,
    'avatar_key': IDL.Text,
    'canister_id': IDL.Principal,
    'is_private': IDL.Bool,
    'box_name': IDL.Text,
    'box_type': BoxType,
  });
  const BoxInfo__1 = IDL.Record({
    'status': BoxStatus,
    'canister_id': IDL.Principal,
    'is_private': IDL.Bool,
    'box_name': IDL.Text,
    'box_type': BoxType,
  });
  const Hash = IDL.Nat32;
  const Key = IDL.Record({'key': BoxInfo__1, 'hash': Hash});
  List.fill(IDL.Opt(IDL.Tuple(IDL.Tuple(Key, IDL.Null), List)));
  const AssocList = IDL.Opt(IDL.Tuple(IDL.Tuple(Key, IDL.Null), List));
  const Leaf = IDL.Record({'size': IDL.Nat, 'keyvals': AssocList});
  const Trie = IDL.Variant({
    'branch': Branch,
    'leaf': Leaf,
    'empty': IDL.Null,
  });
  Branch.fill(IDL.Record({'left': Trie, 'size': IDL.Nat, 'right': Trie}));
  const Set = IDL.Variant({
    'branch': Branch,
    'leaf': Leaf,
    'empty': IDL.Null,
  });
  const Result_3 = IDL.Variant({
    'ok': IDL.Vec(IDL.Principal),
    'err': Error,
  });
  const TopUpArgs = IDL.Record({
    'box_id': IDL.Principal,
    'icp_amount': IDL.Nat64,
  });
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const BlockIndex__1 = IDL.Nat64;
  const Token = IDL.Record({'e8s': IDL.Nat64});
  const BlockIndex = IDL.Nat64;
  const TransferError = IDL.Variant({
    'TxTooOld': IDL.Record({'allowed_window_nanos': IDL.Nat64}),
    'BadFee': IDL.Record({'expected_fee': Token}),
    'TxDuplicate': IDL.Record({'duplicate_of': BlockIndex}),
    'TxCreatedInFuture': IDL.Null,
    'InsufficientFunds': IDL.Record({'balance': Token}),
  });
  const Result_2 = IDL.Variant({'ok': BlockIndex__1, 'err': TransferError});
  const UpdateWasmArgs = IDL.Record({
    'wasm': IDL.Vec(IDL.Nat8),
    'box_type': BoxType,
  });
  const Result_1 = IDL.Variant({'ok': IDL.Text, 'err': IDL.Text});
  const BoxInfo = IDL.Record({
    'status': BoxStatus,
    'canister_id': IDL.Principal,
    'is_private': IDL.Bool,
    'box_name': IDL.Text,
    'box_type': BoxType,
  });
  const UpgradeBoxArgs = IDL.Record({'info': BoxInfo});
  const MetaBox = IDL.Service({
    'acceptSharedBox': IDL.Func([IDL.Principal, IDL.Principal], [Result], []),
    'addAdmin': IDL.Func([IDL.Principal], [IDL.Bool], []),
    'boundOgDataboxOwner': IDL.Func(
      [IDL.Principal, IDL.Principal],
      [Result],
      [],
    ),
    'burnxtc': IDL.Func([IDL.Nat], [RustResult], []),
    'changeAdmin': IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Bool], []),
    'changeBoxAvatarKey': IDL.Func([IDL.Text], [], []),
    'clearLog': IDL.Func([], [], []),
    'createDataBoxFee': IDL.Func([CreateBoxArgs, IDL.Bool], [Result_6], []),
    'createDataBoxFree': IDL.Func([CreateBoxArgs], [Result_6], []),
    'createProfile': IDL.Func([IDL.Vec(IDL.Nat8)], [Result_6], []),
    'deleteBox': IDL.Func([DelBoxArgs], [Result_5], []),
    'emitShareBox': IDL.Func([IDL.Principal, IDL.Principal], [Result], []),
    'getActivitySet': IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getAdmins': IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getBoxState': IDL.Func([IDL.Principal], [Result_4], ['query']),
    'getBoxes': IDL.Func([IDL.Principal], [IDL.Vec(BoxAllInfo)], ['query']),
    'getCycleBalance': IDL.Func([], [IDL.Nat64], ['query']),
    'getDataBoxVersion': IDL.Func([], [IDL.Nat], ['query']),
    'getIcp': IDL.Func([], [IDL.Nat64], []),
    'getLog': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Text))], ['query']),
    'getNameFromPrincipal': IDL.Func(
      [IDL.Principal],
      [IDL.Opt(IDL.Text)],
      ['query'],
    ),
    'getNamePrin': IDL.Func([IDL.Principal], [IDL.Opt(IDL.Text)], ['query']),
    'getOGBoxes': IDL.Func([], [IDL.Vec(BoxInfo__1)], ['query']),
    'getOGNum': IDL.Func([], [IDL.Nat], ['query']),
    'getOGPreBoxes': IDL.Func(
      [IDL.Principal],
      [IDL.Vec(BoxInfo__1)],
      ['query'],
    ),
    'getOGUpBoxes': IDL.Func(
      [IDL.Principal],
      [IDL.Vec(BoxInfo__1)],
      ['query'],
    ),
    'getPre': IDL.Func([], [IDL.Nat, IDL.Nat], ['query']),
    'getPrincipalFromName': IDL.Func(
      [IDL.Text],
      [IDL.Opt(IDL.Principal)],
      ['query'],
    ),
    'getProfile': IDL.Func(
      [IDL.Principal],
      [IDL.Opt(IDL.Principal)],
      ['query'],
    ),
    'getProfileVersion': IDL.Func([], [IDL.Nat], ['query']),
    'getShareBoxes': IDL.Func([], [IDL.Vec(BoxAllInfo)], ['query']),
    'getSharedBoxes': IDL.Func([], [IDL.Vec(BoxAllInfo)], ['query']),
    'getTotal': IDL.Func([], [IDL.Nat, IDL.Nat], ['query']),
    'getUserBalance': IDL.Func([], [IDL.Opt(IDL.Nat)], ['query']),
    'getUserOgBox': IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(IDL.Principal, Set))],
      ['query'],
    ),
    'getUserPreBox': IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(IDL.Principal, Set))],
      ['query'],
    ),
    'initPreCreateDatabox': IDL.Func([], [Result_3], []),
    'initPreCreateProfile': IDL.Func([], [Result_3], []),
    'installCycleWasm': IDL.Func([IDL.Vec(IDL.Nat8)], [Result], []),
    'isNotFirstDataBox': IDL.Func([], [IDL.Bool], ['query']),
    'preCreateDataBox': IDL.Func([], [Result_3], []),
    'preCreateDataBoxOne': IDL.Func([], [Result], []),
    'preCreateProfile': IDL.Func([], [Result_3], []),
    'preCreateProfileOne': IDL.Func([], [Result_3], []),
    'recoverOG': IDL.Func([IDL.Principal], [], []),
    'refreshBalance': IDL.Func([IDL.Principal], [], []),
    'removeShareBox': IDL.Func([IDL.Principal, IDL.Principal], [Result], []),
    'removeSharedBox': IDL.Func([IDL.Principal, IDL.Principal], [Result], []),
    'selfburn': IDL.Func([IDL.Nat], [RustResult], []),
    'setName': IDL.Func([IDL.Text], [Result], []),
    'startBox': IDL.Func([BoxInfo__1], [], []),
    'stopBox': IDL.Func([BoxInfo__1], [], []),
    'topUpBox': IDL.Func([TopUpArgs], [Result], []),
    'transferDataboxOwner': IDL.Func(
      [IDL.Principal, IDL.Principal],
      [Result],
      [],
    ),
    'transferOutICP': IDL.Func([AccountIdentifier, IDL.Nat64], [Result_2], []),
    'transferV1UserID': IDL.Func([IDL.Text, IDL.Principal], [Result], []),
    'updateBoxInfo': IDL.Func([BoxInfo__1], [Result], []),
    'updateDataBoxVersion': IDL.Func([IDL.Nat], [IDL.Bool], []),
    'updateProfileVersion': IDL.Func([IDL.Nat], [IDL.Bool], []),
    'updateWasm': IDL.Func([UpdateWasmArgs], [Result_1], []),
    'upgradeBox': IDL.Func([UpgradeBoxArgs], [Result], []),
    'wallet_receive': IDL.Func([], [], []),
    'xdrUpdate': IDL.Func([], [IDL.Bool], []),
  });
  return MetaBox;
};
export const init = ({IDL}) => {
  return [];
};
