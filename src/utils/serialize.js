/** Strips internal fields from a (lean or hydrated) generation. */
export const toPublicGeneration = (gen) => {
  if (!gen) return gen;
  const obj = typeof gen.toObject === 'function' ? gen.toObject() : { ...gen };
  delete obj.__v;
  delete obj.outputPublicId;
  delete obj.lockedAt;
  delete obj.lastCheckedAt;
  return obj;
};

export const toPublicUser = (user) => {
  if (!user) return user;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.__v;
  return obj;
};
