export const defaultDescriptor = {
    writable: true,
    enumerable: true,
    configurable: false,
};

export function deCapitalize(s) {
    return s ? s.slice(0,1).toLowerCase()+s.slice(1) : s
}
