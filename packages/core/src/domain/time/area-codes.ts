/**
 * North American area codes that sit entirely in one time zone. Used to derive a recipient's local
 * time for SMS when the contact has no time zone of their own. Split codes (for example 850 in
 * Florida, 605 in South Dakota) are deliberately absent: an SMS to an unknown zone is skipped,
 * never guessed. Extend by registering more entries; every entry here was checked by hand.
 */
export const NANP_AREA_CODE_ZONES: Readonly<Record<string, string>> = {
  // New York
  212: 'America/New_York', 646: 'America/New_York', 917: 'America/New_York', 718: 'America/New_York',
  347: 'America/New_York', 929: 'America/New_York', 516: 'America/New_York', 631: 'America/New_York',
  914: 'America/New_York', 845: 'America/New_York', 518: 'America/New_York', 585: 'America/New_York',
  716: 'America/New_York', 315: 'America/New_York', 607: 'America/New_York',
  // New Jersey, Connecticut, New England
  201: 'America/New_York', 551: 'America/New_York', 973: 'America/New_York', 862: 'America/New_York',
  732: 'America/New_York', 848: 'America/New_York', 908: 'America/New_York', 609: 'America/New_York',
  640: 'America/New_York', 856: 'America/New_York', 203: 'America/New_York', 475: 'America/New_York',
  860: 'America/New_York', 959: 'America/New_York', 401: 'America/New_York', 603: 'America/New_York',
  207: 'America/New_York', 802: 'America/New_York', 617: 'America/New_York', 857: 'America/New_York',
  781: 'America/New_York', 339: 'America/New_York', 508: 'America/New_York', 978: 'America/New_York',
  351: 'America/New_York', 413: 'America/New_York',
  // Mid-Atlantic
  202: 'America/New_York', 215: 'America/New_York', 267: 'America/New_York', 445: 'America/New_York',
  610: 'America/New_York', 484: 'America/New_York', 412: 'America/New_York', 717: 'America/New_York',
  410: 'America/New_York', 443: 'America/New_York', 301: 'America/New_York', 240: 'America/New_York',
  804: 'America/New_York', 757: 'America/New_York', 703: 'America/New_York', 571: 'America/New_York',
  540: 'America/New_York', 302: 'America/New_York', 304: 'America/New_York',
  // Southeast
  404: 'America/New_York', 470: 'America/New_York', 678: 'America/New_York', 770: 'America/New_York',
  305: 'America/New_York', 786: 'America/New_York', 954: 'America/New_York', 754: 'America/New_York',
  561: 'America/New_York', 407: 'America/New_York', 321: 'America/New_York', 813: 'America/New_York',
  727: 'America/New_York', 904: 'America/New_York', 704: 'America/New_York', 980: 'America/New_York',
  919: 'America/New_York', 984: 'America/New_York', 336: 'America/New_York', 910: 'America/New_York',
  803: 'America/New_York', 843: 'America/New_York', 864: 'America/New_York', 865: 'America/New_York',
  423: 'America/New_York', 502: 'America/New_York', 859: 'America/New_York',
  // Great Lakes (Eastern)
  216: 'America/New_York', 440: 'America/New_York', 614: 'America/New_York', 380: 'America/New_York',
  513: 'America/New_York', 937: 'America/New_York', 330: 'America/New_York', 234: 'America/New_York',
  419: 'America/New_York', 313: 'America/New_York', 248: 'America/New_York', 734: 'America/New_York',
  586: 'America/New_York', 810: 'America/New_York', 616: 'America/New_York', 317: 'America/New_York',
  463: 'America/New_York',
  // Central
  312: 'America/Chicago', 773: 'America/Chicago', 872: 'America/Chicago', 630: 'America/Chicago',
  708: 'America/Chicago', 847: 'America/Chicago', 713: 'America/Chicago', 281: 'America/Chicago',
  832: 'America/Chicago', 346: 'America/Chicago', 214: 'America/Chicago', 469: 'America/Chicago',
  972: 'America/Chicago', 817: 'America/Chicago', 682: 'America/Chicago', 512: 'America/Chicago',
  737: 'America/Chicago', 210: 'America/Chicago', 612: 'America/Chicago', 651: 'America/Chicago',
  763: 'America/Chicago', 952: 'America/Chicago', 314: 'America/Chicago', 636: 'America/Chicago',
  816: 'America/Chicago', 615: 'America/Chicago', 629: 'America/Chicago', 901: 'America/Chicago',
  414: 'America/Chicago', 262: 'America/Chicago', 608: 'America/Chicago', 920: 'America/Chicago',
  205: 'America/Chicago', 251: 'America/Chicago', 256: 'America/Chicago', 334: 'America/Chicago',
  659: 'America/Chicago', 601: 'America/Chicago', 662: 'America/Chicago', 769: 'America/Chicago',
  501: 'America/Chicago', 479: 'America/Chicago', 870: 'America/Chicago', 504: 'America/Chicago',
  985: 'America/Chicago', 225: 'America/Chicago', 318: 'America/Chicago', 337: 'America/Chicago',
  405: 'America/Chicago', 918: 'America/Chicago', 539: 'America/Chicago', 580: 'America/Chicago',
  402: 'America/Chicago', 531: 'America/Chicago', 316: 'America/Chicago', 785: 'America/Chicago',
  913: 'America/Chicago', 620: 'America/Chicago', 515: 'America/Chicago', 319: 'America/Chicago',
  563: 'America/Chicago', 641: 'America/Chicago', 712: 'America/Chicago',
  // Mountain
  303: 'America/Denver', 720: 'America/Denver', 970: 'America/Denver', 719: 'America/Denver',
  801: 'America/Denver', 385: 'America/Denver', 435: 'America/Denver', 406: 'America/Denver',
  307: 'America/Denver', 505: 'America/Denver', 575: 'America/Denver',
  // Arizona (no daylight saving)
  602: 'America/Phoenix', 480: 'America/Phoenix', 623: 'America/Phoenix', 520: 'America/Phoenix',
  // Pacific
  213: 'America/Los_Angeles', 310: 'America/Los_Angeles', 323: 'America/Los_Angeles', 424: 'America/Los_Angeles',
  818: 'America/Los_Angeles', 626: 'America/Los_Angeles', 714: 'America/Los_Angeles', 949: 'America/Los_Angeles',
  619: 'America/Los_Angeles', 858: 'America/Los_Angeles', 415: 'America/Los_Angeles', 510: 'America/Los_Angeles',
  650: 'America/Los_Angeles', 408: 'America/Los_Angeles', 916: 'America/Los_Angeles', 925: 'America/Los_Angeles',
  707: 'America/Los_Angeles', 559: 'America/Los_Angeles', 805: 'America/Los_Angeles', 831: 'America/Los_Angeles',
  909: 'America/Los_Angeles', 951: 'America/Los_Angeles', 760: 'America/Los_Angeles', 206: 'America/Los_Angeles',
  253: 'America/Los_Angeles', 425: 'America/Los_Angeles', 360: 'America/Los_Angeles', 509: 'America/Los_Angeles',
  503: 'America/Los_Angeles', 971: 'America/Los_Angeles', 541: 'America/Los_Angeles', 702: 'America/Los_Angeles',
  725: 'America/Los_Angeles', 775: 'America/Los_Angeles',
  // Alaska, Hawaii, Puerto Rico
  907: 'America/Anchorage', 808: 'Pacific/Honolulu', 787: 'America/Puerto_Rico', 939: 'America/Puerto_Rico',
  // Canada
  416: 'America/Toronto', 647: 'America/Toronto', 437: 'America/Toronto', 905: 'America/Toronto',
  289: 'America/Toronto', 365: 'America/Toronto', 613: 'America/Toronto', 343: 'America/Toronto',
  519: 'America/Toronto', 226: 'America/Toronto', 548: 'America/Toronto', 705: 'America/Toronto',
  249: 'America/Toronto', 514: 'America/Toronto', 438: 'America/Toronto', 450: 'America/Toronto',
  579: 'America/Toronto', 418: 'America/Toronto', 581: 'America/Toronto', 819: 'America/Toronto',
  873: 'America/Toronto', 604: 'America/Vancouver', 778: 'America/Vancouver', 236: 'America/Vancouver',
  403: 'America/Edmonton', 587: 'America/Edmonton', 780: 'America/Edmonton', 825: 'America/Edmonton',
  306: 'America/Regina', 639: 'America/Regina', 204: 'America/Winnipeg', 431: 'America/Winnipeg',
  902: 'America/Halifax', 782: 'America/Halifax', 506: 'America/Halifax', 709: 'America/St_Johns',
};
