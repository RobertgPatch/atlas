import { EQUITY_SECTORS, type EquitySector } from '../../../../../../packages/types/src/liquidity-sectors'
export { EQUITY_SECTORS, SECTOR_FILTER_OPTIONS, normalizeSectorSymbol } from '../../../../../../packages/types/src/liquidity-sectors'
export type { EquitySector, SectorFilterOption } from '../../../../../../packages/types/src/liquidity-sectors'

/**
 * Reviewed, offline S&P 500 reference (504 equity share-class tickers).
 * Source: iShares IVV holdings, equity rows only; cash/derivatives excluded.
 * Refresh from the source CSV, normalize share-class separators, and review the
 * catalog diff and conformance tests together. Never fetch this at render time.
 * "Communication" and "Information Technology" use our display names below.
 * This is S&P 500 coverage, not a claim to be the 500 largest global equities.
 */
export const SP500_SECTOR_CATALOG_SOURCE = {
  asOf: '2026-09-28',
  url: 'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/latest-holdings.csv',
  symbolCount: 504,
} as const

export const SP500_SYMBOLS_BY_SECTOR: Readonly<Record<EquitySector, string>> = {
  'Communication Services':
    'APP CHTR CMCSA DIS ECHO FOX FOXA GOOG GOOGL LYV META NFLX NWS NWSA OMC PSKY RDDT T TKO TMUS TTWO VZ WBD',
  'Consumer Discretionary':
    'ABNB AMZN APTV AZO BBY BKNG CCL CMG CVNA DASH DECK DHI DPZ DRI EBAY EXPE F GM GPC GRMN HAS HD HLT LEN LOW LULU LVS MAR MCD MGM NCLH NKE NVR ORLY PHM RCL RL ROST SBUX TJX TPR TSCO TSLA ULTA WSM WYNN YUM',
  'Consumer Staples':
    'ADM BF.B BG CASY CHD CL CLX COST DG DLTR EL GIS HRL HSY KDP KHC KMB KO KR KVUE MDLZ MKC MNST MO PEP PG PM SJM STZ SYY TGT TSN WMT',
  Energy:
    'APA BKR COP CVX DVN EOG EQT EXE FANG HAL KMI MPC OKE OXY PSX SLB TPL TRGP VLO WMB XOM',
  Financials:
    'ACGL AFL AIG AIZ AJG ALL AMP AON APO ARES AXP BAC BEN BLK BNY BRK.B BRO BX C CB CBOE CFG CINF CME COF COIN CPAY EG ERIE FDS FIS FISV FITB GL GPN GS HBAN HIG HOOD IBKR ICE IVZ JKHY JPM KEY KKR L MA MCO MET MRSH MS MSCI MTB NDAQ NTRS PFG PGR PNC PRU PYPL RF RJF SCHW SPGI STT SYF TFC TROW TRV USB V WFC WRB WTW XYZ',
  'Health Care':
    'A ABBV ABT ALGN AMGN BAX BDX BIIB BMY BSX CAH CI CNC COO COR CRL CVS DGX DHR DVA DXCM ELV EW GEHC GILD HCA HOLX HSIC HUM IDXX ILMN INCY IQV ISRG JNJ LH LLY MCK MDT MRK MRNA MTD PFE PODD REGN RMD RVTY SOLV STE SYK TECH TMO UHS UNH VEEV VRTX VTRS WAT WST ZBH ZTS',
  Industrials:
    'ADP ALLE AME AOS AXON BA BE BR CARR CAT CHRW CMI CPRT CSX CTAS DAL DD DE DOV EFX EME EMR ETN EXPD FAST FDX FDXF FERG FIX FTV GD GE GEV GNRC GWW HII HON HONA HUBB HWM IEX IR ITW J JBHT JCI LDOS LHX LII LMT LUV MAS MMM NDSN NOC NSC ODFL OTIS PAYX PCAR PH PNR PWR ROK ROL RSG RTX SNA SWK TDG TT TXT UAL UBER UNP UPS URI VLTO VRSK VRT WAB WM XYL',
  Materials:
    'ALB AMCR APD AVY BALL CF CRH CTVA DOW ECL FCX IFF IP LIN LYB MLM MOS NEM NUE PKG PPG SHW STLD SW VMC',
  'Real Estate':
    'AMT ARE BXP CBRE CCI CPT CSGP DLR DOC EQIX ESS EXR FRT HST INVH IRM KIM MAA O PLD PSA REG SBAC SPG UDR VICI VMRK VTR WELL WY',
  Utilities:
    'AEE AEP AES ATO AWK CEG CMS CNP D DTE DUK ED EIX ES ETR EVRG EXC FE LNT NEE NI NRG PCG PEG PNW PPL SO SRE VST WEC XEL',
  Technology:
    'AAPL ACN ADBE ADI ADSK AKAM AMAT AMD ANET APH AVGO CDNS CDW CIEN COHR CRM CRWD CSCO CTSH DDOG DELL FFIV FICO FLEX FSLR FTNT GDDY GEN GLW HPE HPQ IBM INTC INTU IT JBL KEYS KLAC LITE LRCX MCHP MPWR MRVL MSFT MSI MU NOW NTAP NVDA NXPI ON ORCL P PANW PLTR PTC Q QCOM ROP SMCI SNDK SNPS STX SWKS TDY TEL TER TRMB TXN TYL VRSN WDAY WDC ZBRA',
}

export const sp500SectorBySymbol: Readonly<Record<string, EquitySector>> =
  Object.fromEntries(
    EQUITY_SECTORS.flatMap((sector) =>
      SP500_SYMBOLS_BY_SECTOR[sector].split(' ').map((symbol) => [symbol, sector]),
    ),
  )

/**
 * Additional names from the importer's 2026-09-25 top-500 symbol reference
 * that are not in IVV. Verified against IWV equity holdings on 2026-09-28.
 * This supplements index membership; it does not infer sectors from fund names.
 */
export const ADDITIONAL_SECTOR_CATALOG_SOURCE = {
  asOf: '2026-09-28',
  url: 'https://www.ishares.com/us/products/239714/ishares-russell-3000-etf/latest-holdings.csv',
  symbolCount: 55,
} as const

export const ADDITIONAL_SYMBOLS_BY_SECTOR: Readonly<Partial<Record<EquitySector, string>>> = {
  'Communication Services': 'ASTS FWONA FWONK RBLX ROKU SPCX SPOT',
  'Consumer Discretionary': 'CPNG QSR RIVN SN VIK',
  Energy: 'LNG',
  Financials: 'AFRM FCNCA LPLA MKL NU RKT SOFI TW',
  'Health Care': 'ALNY GH INSM MDLN NTRA ROIV RPRX RVMD',
  Industrials: 'ATI HEI NVT RKLB SUNB',
  Materials: 'AU SCCO',
  Technology: 'ALAB CRCL CRDO CRWV ENTG GFS IOT MDB MSTR MTSI NET OKTA RBRK SNOW TEAM TWLO UI ZM ZS',
}

export const additionalSectorBySymbol: Readonly<Record<string, EquitySector>> =
  Object.fromEntries(
    EQUITY_SECTORS.flatMap((sector) =>
      ADDITIONAL_SYMBOLS_BY_SECTOR[sector]?.split(' ').map((symbol) => [symbol, sector]) ?? [],
    ),
  )
