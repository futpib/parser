import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { type Parser, setParserName } from './parser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { promiseCompose } from './promiseCompose.js';
import { createQuantifierParser } from './quantifierParser.js';
import { createTupleParser } from './tupleParser.js';
import { createUnionParser } from './unionParser.js';

// https://github.com/openjdk/jdk/blob/c517ffba7d9388e75b5d7bba77e565e71c0a7d76/src/java.base/share/classes/com/sun/crypto/provider/JceKeyStore.java#L512-L553

const uint64BEParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(8),
	array => Buffer.from(array).readBigUInt64BE(),
);

setParserName(uint64BEParser, 'uint64BEParser');

const uint32BEParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(4),
	array => Buffer.from(array).readUInt32BE(),
);

setParserName(uint32BEParser, 'uint32BEParser');

const uint16BEParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(2),
	array => Buffer.from(array).readUInt16BE(),
);

setParserName(uint16BEParser, 'uint16BEParser');

const createUint32BECountPrefixedParser = <T>(elementParser: Parser<T, Uint8Array>): Parser<T[], Uint8Array> => parserCreatorCompose(
	() => uint32BEParser,
	count => createQuantifierParser(elementParser, count),
)();

const javaModifiedUTF8StringParser: Parser<string, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => uint16BEParser,
		length => createFixedLengthSequenceParser(length),
	)(),
	uint8Array => Buffer.from(uint8Array).toString('utf8'), // TODO?: Java Modified UTF-8 decoding
);

const uint32LengthPrefixedUint8ArrayParser = parserCreatorCompose(
	() => uint32BEParser,
	length => createFixedLengthSequenceParser(length),
)();

const javaKeyStoreImplementationParser: Parser<'JKS' | 'JCEKS', Uint8Array> = promiseCompose(
	createUnionParser<Uint8Array, Uint8Array>([
		createExactSequenceParser<Uint8Array>(Buffer.from('feedfeed', 'hex')),
		createExactSequenceParser<Uint8Array>(Buffer.from('cececece', 'hex')),
	]),
	uint8Array => uint8Array[0] === 0xFE ? 'JKS' : 'JCEKS',
);

const javaKeyStorePrivateKeyEntryPrivateKeyParser = uint32LengthPrefixedUint8ArrayParser;

const javaKeyStorePrivateKeyEntryCertificateParser = promiseCompose(
	createTupleParser([
		javaModifiedUTF8StringParser,
		uint32LengthPrefixedUint8ArrayParser,
	]),
	([ type, certificate ]) => ({ type, certificate }),
);

const javaKeyStorePrivateKeyEntryCertificateChainParser = createUint32BECountPrefixedParser(
	javaKeyStorePrivateKeyEntryCertificateParser,
);

const javaKeyStorePrivateKeyEntryParser = promiseCompose(
	createTupleParser([
		createExactSequenceParser<Uint8Array>(Buffer.from('00000001', 'hex')),
		javaModifiedUTF8StringParser,
		uint64BEParser,
		javaKeyStorePrivateKeyEntryPrivateKeyParser,
		javaKeyStorePrivateKeyEntryCertificateChainParser,
	]),
	([
		_tag,
		alias,
		creationDate,
		privateKey,
		certificateChain,
	]) => ({
		type: 'privateKey',
		alias,
		creationDate: new Date(Number(creationDate)),
		privateKey,
		certificateChain,
	}),
);

const javaKeyStoreTrustedCertEntryParser = createTupleParser([
	createExactSequenceParser<Uint8Array>(Buffer.from('00000002', 'hex')),
	async parserContext => parserContext.invariant(false, 'Not implemented'),
]);

const javaKeyStoreSecretKeyEntryParser = createTupleParser([
	createExactSequenceParser<Uint8Array>(Buffer.from('00000003', 'hex')),
	async parserContext => parserContext.invariant(false, 'Not implemented'),
]);

const javaKeyStoreEntryParser = createUnionParser([
	javaKeyStorePrivateKeyEntryParser,
	javaKeyStoreTrustedCertEntryParser,
	javaKeyStoreSecretKeyEntryParser,
]);

const javaKeyStoreEntriesParser = createUint32BECountPrefixedParser(
	javaKeyStoreEntryParser,
);

const javaKeyStoreParser_ = createTupleParser([
	javaKeyStoreImplementationParser,
	uint32BEParser,
	javaKeyStoreEntriesParser,
	createFixedLengthSequenceParser(20),
]);

export const javaKeyStoreParser: Parser<unknown, Uint8Array> = promiseCompose(
	javaKeyStoreParser_,
	([
		implementation,
		version,
		entries,
		hash,
	]) => ({
		implementation,
		version,
		entries,
		hash,
	}),
);
