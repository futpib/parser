import { runParser } from './build/parser.js';
import { stringParserInputCompanion } from './build/parserInputCompanion.js';
import { smaliParser } from './build/smaliParser.js';

const smali = `.class public Landroidx/recyclerview/widget/LinearSmoothScroller;
.super Ljava/lang/Object;
.source "LinearSmoothScroller.java"

# static fields
.field private static final DEBUG:Z = false
.field private static final MILLISECONDS_PER_INCH:F = 25.0f

# direct methods
.method public constructor <init>()V
    .registers 1
    return-void
.end method
`;

const result = await runParser(smaliParser, smali, stringParserInputCompanion, {
  errorJoinMode: 'all',
});

console.log('Static fields:', result.classData.staticFields);
console.log('Static values:', result.staticValues);
