import { buildXlsxFixture, type XlsxFixtureCell, type XlsxFixtureSheet } from '../../adapter-conformance/fixture-builders.js'

const headers = ['Name','Product Type','Open Order','Symbol','CUSIP','Last ($)','As of','Quantity','Market Value ($)',"Today's Change (%)","Today's Change ($)",'Total Cost ($)','Adjusted Cost ($)','Unrealized Gain/Loss (%)','Unrealized Gain/Loss ($)','Accrued Interest']
const column = (index:number) => String.fromCharCode(65 + index)
const textRow = (index:number, values:string[]) => ({index,cells:values.map((value,i):XlsxFixtureCell=>({address:`${column(i)}${index}`,kind:'inlineString',value}))})
const valueRow = (index:number, values:string[]) => ({index,cells:values.map((value,i):XlsxFixtureCell=>/^-?\d+(?:\.\d+)?$/u.test(value)?{address:`${column(i)}${index}`,kind:'number',value}:{address:`${column(i)}${index}`,kind:'inlineString',value})})

function accountSheet(name:string,mask:string,date:string,value:string,options:{visibility?:XlsxFixtureSheet['visibility'];note?:boolean;hiddenPosition?:boolean}={}):XlsxFixtureSheet{
  return {name,visibility:options.visibility,rows:[
    textRow(2,[`Holdings for Account ${name} - ${mask} as of ${date} 1:31 PM ET`]),
    textRow(6,headers),
    {...valueRow(7,[`${name} PUBLIC CO`,'Stocks / Options','No',`S${mask}`,'000000101','10',date,'10',value,'0','0','80','80','25','20','0']),hidden:options.hiddenPosition},
    valueRow(8,['Total','-','-','-','-','-','-','-',value,'0','0','80','80','-','20','0']),
    ...(options.note?[textRow(12,['For information only. Values may be rounded.'])]:[]),
  ]}
}

export function buildMorganStanleyMultiAccountFixture(options:{hidden?:boolean;unknownNumeric?:boolean}={}):Buffer{
  const sheets:XlsxFixtureSheet[]=[
    accountSheet('Synthetic Account A','1001','10/15/2026','100',{note:true,hiddenPosition:true}),
    accountSheet('Synthetic Account B','2002','10/16/2026','200'),
  ]
  if(options.hidden)sheets.push(accountSheet('Hidden Account','3003','10/17/2026','300',{visibility:'hidden'}))
  if(options.unknownNumeric)sheets.push({name:'Unrecognized Detail',rows:[textRow(1,['Unmapped portfolio detail']),valueRow(2,['Unknown position','999'])]})
  return buildXlsxFixture({sheets})
}
