import configuration from './configuration';

describe('Online proof storage configuration', () => {
  const original = process.env.PRIVATE_ONLINE_PROOF_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.PRIVATE_ONLINE_PROOF_DIR;
    else process.env.PRIVATE_ONLINE_PROOF_DIR = original;
  });

  it('passes the configured private proof directory to the storage service', () => {
    process.env.PRIVATE_ONLINE_PROOF_DIR = '/srv/noamany/private/payment-proofs';
    expect(configuration()).toHaveProperty('privateOnlineProofDir', '/srv/noamany/private/payment-proofs');
  });

  it('defaults to a private directory outside the public uploads root', () => {
    delete process.env.PRIVATE_ONLINE_PROOF_DIR;
    expect(configuration()).toHaveProperty('privateOnlineProofDir', './private-online-proofs');
  });
});
