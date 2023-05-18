export const idlFactory = ({IDL}:any) => {
  const Delegation = IDL.Record({
    'pubkey': IDL.Vec(IDL.Nat8),
    'targets': IDL.Opt(IDL.Vec(IDL.Principal)),
    'expiration': IDL.Nat64,
  });
  const SignedDelegation = IDL.Record({
    'signature': IDL.Vec(IDL.Nat8),
    'delegation': Delegation,
  });
  const GetDelegationResponse = IDL.Variant({
    'no_such_delegation': IDL.Null,
    'signed_delegation': SignedDelegation,
  });
  return IDL.Service({
    'get_delegation': IDL.Func(
      [IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8), IDL.Nat64],
      [GetDelegationResponse],
      ["query"],
    ),
    'prepare_delegation': IDL.Func(
      [IDL.Opt(IDL.Nat64), IDL.Tuple(IDL.Text, IDL.Text, IDL.Text)],
      [IDL.Vec(IDL.Nat8), IDL.Nat64],
      [],
    ),
  });
};
export const init = ({IDL}) => {
  return [];
};
