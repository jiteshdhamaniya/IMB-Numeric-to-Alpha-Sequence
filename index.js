// build tables of 13-bit codewords
const encode_table = new Array(1365)
const decode_table = new Array(8192)
const fcs_table = new Array(8192)

// barcode-to-bit permutation
// eslint-disable-next-line no-console
const desc_char = [
    7, 1, 9, 5, 8, 0, 2, 4, 6, 3, 5, 8, 9, 7, 3, 0, 6, 1, 7, 4, 6, 8, 9, 2,
    5, 1, 7, 5, 4, 3, 8, 7, 6, 0, 2, 5, 4, 9, 3, 0, 1, 6, 8, 2, 0, 4, 5, 9,
    6, 7, 5, 2, 6, 3, 8, 5, 1, 9, 8, 7, 4, 0, 2, 6, 3,
]
// eslint-disable-next-line no-console
const desc_bit = [
    4, 1024, 4096, 32, 512, 2, 32, 16, 8, 512, 2048, 32, 1024, 2, 64, 8, 16,
    2, 1024, 1, 4, 2048, 256, 64, 2, 4096, 8, 256, 64, 16, 16, 2048, 1, 64,
    2, 512, 2048, 32, 8, 128, 8, 1024, 128, 2048, 256, 4, 1024, 8, 32, 256,
    1, 8, 4096, 2048, 256, 16, 32, 2, 8, 1, 128, 4096, 512, 256, 1024,
]
// eslint-disable-next-line no-console
const asc_char = [
    4, 0, 2, 6, 3, 5, 1, 9, 8, 7, 1, 2, 0, 6, 4, 8, 2, 9, 5, 3, 0, 1, 3, 7,
    4, 6, 8, 9, 2, 0, 5, 1, 9, 4, 3, 8, 6, 7, 1, 2, 4, 3, 9, 5, 7, 8, 3, 0,
    2, 1, 4, 0, 9, 1, 7, 0, 2, 4, 6, 3, 7, 1, 9, 5, 8,
]
// eslint-disable-next-line no-console
const asc_bit = [
    8, 1, 256, 2048, 2, 4096, 256, 2048, 1024, 64, 16, 4096, 4, 128, 512,
    64, 128, 512, 4, 256, 16, 1, 4096, 128, 1024, 512, 1, 128, 1024, 32,
    128, 512, 64, 256, 4, 4096, 2, 16, 4, 1, 2, 32, 16, 64, 4096, 2, 1, 512,
    16, 128, 32, 1024, 4, 64, 512, 2048, 4, 4096, 64, 128, 32, 2048, 1, 8,
    4,
]

const add = (bytes, add) => {
    // bytes is an array of bytes representing a multiple-precision number.
    // add "add" to bytes.
    let n, x
    for (n = bytes.length - 1; n >= 0 && add != 0; n--) {
        x = bytes[n] + add
        add = x >> 8
        bytes[n] = x & 0xff
    }
}

const muladd = (bytes, mult, add) => {
    // bytes is an array of bytes representing a multiple-precision number.
    // multiply bytes by "mult" and add "add".
    // assuming 32-bit integers, the largest mult can be without overflowing
    // is about 2**23, or approximately 8 million.
    var n, x
    for (n = bytes.length - 1; n >= 0; n--) {
        x = bytes[n] * mult + add
        add = x >> 8
        bytes[n] = x & 0xff
    }
}

const divmod = (bytes, div) => {
    // bytes is an array of bytes representing a multiple-precision number.
    // divide bytes by "div" and return remainder.
    // div is limited the same way as mult above.
    var mod = 0
    var n,
        x,
        q,
        len = bytes.length
    for (n = 0; n < len; n++) {
        x = bytes[n] + (mod << 8)
        bytes[n] = q = Math.floor(x / div)
        mod = x - q * div
    }
    return mod
}

const calcfcs = (bytes) => {
    // calculate 11-bit frame check sequence for an array of bytes.
    var fcs = 0x5a8
    // iterating the bit loop twice on the initial value of fcs yeilds 0x7ff,
    // which is the proper starting value when the first two bits are skipped.
    var n,
        bit,
        len = bytes.length
    for (n = 0; n < len; n++) {
        fcs ^= bytes[n] << 3
        for (bit = 0; bit < 8; bit++) {
            fcs <<= 1
            if (fcs & 0x800) fcs ^= 0xf35
        }
    }
    return fcs
}

const chars_to_text = (chars) => {
    var barcode = ''
    for (let n = 0; n < 65; n++) {
        if (chars[desc_char[n]] & desc_bit[n]) {
            if (chars[asc_char[n]] & asc_bit[n]) barcode += 'F'
            else barcode += 'D'
        } else {
            if (chars[asc_char[n]] & asc_bit[n]) barcode += 'A'
            else barcode += 'T'
        }
    }
    return barcode
}

const encode_fields = (inf) => {
    let n
    let bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let marker = 0

    inf = {
        barcode_id: inf.substr(0, 2),
        service_type: inf.substr(2, 3),
        mailer_id: inf.substr(5, 6),
        serial_num: inf.substr(11, 9),
        zip: inf.substr(20, 5),
        plus4: inf.substr(25, 4),
        delivery_pt: inf.substr(29),
    }

    if (inf.zip != '') {
        bytes[12] = parseInt(inf.zip, 10)
        marker += 1
    }
    if (inf.plus4 != '') {
        muladd(bytes, 10000, parseInt(inf.plus4, 10))
        marker += 100000
    }
    if (inf.delivery_pt != '') {
        muladd(bytes, 100, parseInt(inf.delivery_pt, 10))
        marker += 1000000000
    }
    add(bytes, marker)

    muladd(bytes, 10, parseInt(inf.barcode_id.charAt(0), 10))
    muladd(bytes, 5, parseInt(inf.barcode_id.charAt(1), 10))
    muladd(bytes, 1000, parseInt(inf.service_type, 10))
    if (inf.mailer_id.length == 6) {
        // we don't know this so we force it
        muladd(bytes, 1000000, parseInt(inf.mailer_id, 10))
        muladd(bytes, 100000, 0) // multiply in two steps to avoid overflow
        muladd(bytes, 10000, parseInt(inf.serial_num, 10))
    } else {
        muladd(bytes, 10000, 0)
        muladd(bytes, 100000, parseInt(inf.mailer_id, 10))
        muladd(bytes, 1000000, parseInt(inf.serial_num, 10))
    }

    var fcs = calcfcs(bytes)
    var cw = new Array(10)
    cw[9] = divmod(bytes, 636) << 1
    for (n = 8; n > 0; n--) {
        cw[n] = divmod(bytes, 1365)
    }
    cw[0] = (bytes[11] << 8) + bytes[12]
    if (fcs & (1 << 10)) {
        cw[0] += 659
    }
    var chars = new Array(10)
    for (n = 0; n < 10; n++) {
        chars[n] = encode_table[cw[n]]
        if (fcs & (1 << n)) {
            chars[n] ^= 8191
        }
    }

    console.log(chars_to_text(chars))
    return chars_to_text(chars)
}

// const beep = (vol, freq, duration) => {
//     const a = new AudioContext() // browsers limit the number of concurrent audio contexts, so you better re-use'em
//     let v = a.createOscillator()
//     let u = a.createGain()
//     v.connect(u)
//     v.frequency.value = freq
//     v.type = 'square'
//     u.connect(a.destination)
//     u.gain.value = vol * 0.01
//     v.start(a.currentTime)
//     v.stop(a.currentTime + duration * 0.001)
// }

const build_codewords = (bits, low, hi) => {
    var fwd, rev, pop, tmp, bit
    // loop through all possible 13-bit codewords
    for (fwd = 0; fwd < 8192; fwd++) {
        // build reversed codeword and count population of 1-bits
        pop = 0
        rev = 0
        tmp = fwd
        for (bit = 0; bit < 13; bit++) {
            pop += tmp & 1
            rev = (rev << 1) | (tmp & 1)
            tmp >>= 1
        }
        if (pop != bits) continue

        if (fwd == rev) {
            // palindromic codes go at the end of the table
            encode_table[hi] = fwd
            decode_table[fwd] = hi
            decode_table[fwd ^ 8191] = hi
            fcs_table[fwd] = 0
            fcs_table[fwd ^ 8191] = 1
            hi--
        } else if (fwd < rev) {
            // add foreward code to front of table
            encode_table[low] = fwd
            decode_table[fwd] = low
            decode_table[fwd ^ 8191] = low
            fcs_table[fwd] = 0
            fcs_table[fwd ^ 8191] = 1
            low++

            // add reversed code to front of table
            encode_table[low] = rev
            decode_table[rev] = low
            decode_table[rev ^ 8191] = low
            fcs_table[rev] = 0
            fcs_table[rev ^ 8191] = 1
            low++
        }
    }
}

// Call (IMPORTANT)
// build_codewords(5, 0, 1286)
// build_codewords(2, 1287, 1364)
// on init. 
// and then encode_fields(barcode) to convert. 