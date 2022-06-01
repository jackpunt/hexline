    //     pMoves:          true                     false
    // Note: (mh:2, nh:1, pW=1.0) after 'Black[1,1]' -> (pWorker=false); bestHexState.eval
    // WHITE@[1,3] dms: 73, dsid: '1,133' (dms: 86, dsid: '1,447'); dms: 80, dsid:   '996'
    // BLACK@[0,3] dms: 32, dsid: '607'   (dms: 55, dsid: '909')  ; dms: 93, dsid: '1,241' - Black[0,2]
    // WHITE@[0,2] dms: 16, dsid: '258'   (dms: 20, dsid: '258')  ; dms: 10, dsid:   '115' - White[0,3]
    // BLACK@[2,2] dms: 17, dsid: '277'   (dms: 26, dsid: '322')  ; dms: 22, dsid:   '293' - Black[1,2]
    //
    // Note: (mh:3, nh:1, pW=1.0) after 'Black[2,1]'-> (pWorker=false)
    // White[1,2] dms: 14144, dsid: '364,437'; (dms: 14134, dsid: '374,896')
    // Black[3,2] dms: 26501, dsid: '610,868'; (dms: 33035, dsid: '783,695')
    // White[2,4] dms: 19270, dsid: '481,793'; (dms: 18401, dsid: '464,466')
    // Black[4,3] dms: 13705, dsid: '268,854'; (dms: 18403, dsid: '402,543') Black[0,2]
    // White[1,4] dms:  7570, dsid: '144,670'; (dms:  6100, dsid: '132,266') White[0,3]

    // Note: (mh:3, nh:1, pW=1.0) after 'Black[2,1]'-> (pWorker = true)                 [isSX]
    // White[1,2] dms: 12123, dsid: '364,437'; (dms: 14134, dsid: '374,896') dms: 12656, dsid: '329,815' 
    // Black[3,2] dms: 23186, dsid: '610,868'; (dms: 33035, dsid: '783,695') dms: 23033, dsid: '533,080'
    // White[2,4] dms: 17849, dsid: '481,793'; (dms: 18401, dsid: '464,466') dms: 18384, dsid: '435,924'
    // Black[4,3] dms: 11188, dsid: '268,854'; (dms: 18403, dsid: '402,543') B[0,2] dms:  9790, dsid: '206,793' B[0,4]
    // White[1,4] dms:  6432, dsid: '144,670'; (dms:  6100, dsid: '132,266') W[0,3] dms: 11750, dsid: '247,673' W[2,3]

    // Note: (mh:3, nh:1, pW=0.9) after 'Black[2,1]'->
    // White[1,2] dms: 14825, dsid: '382,897'; (dms: 15820, dsid: '384,412')
    // Black[3,2] dms: 24128, dsid: '544,834'; (dms: 26824, dsid: '611,340')
    // White[2,4] dms: 19437, dsid: '476,328'; (dms: 19877, dsid: '473,667')
    // Black[0,4] dms: 11235, dsid: '247,251'; (dms: 16748, dsid: '355,987')
    // White[1,4] dms:  7664, dsid: '153,047'; (dms: 20333, dsid: '407,456') White[4,4]

// (mh:4, nh:1, pW=1.0) after 'Black[3,1] isSx, onAxis
// #  2 WHITE@[3,3] dsid:   777,284 dms:  37931


    // (mh:4, nh:1, pW=1.0) after 'Black[3,1]           isSX: (onAxis)
    // White[3,3]  dms: 34449, dsid:   '777,284' (better wv1?)
    // Black[3,5]  dms:126093, dsid: '2,522,506'
    // White[2,2]! dms: 96391, dsid: '1,923,425'
    // Black[3,6]  dms: 91567, dsid: '1,827,967'
    // White[3,2]c dms: 34421, dsid:   '707,855'
    // Black[2,4]c dms: 40121, dsid:   '776,000'
    // White[4,4]  dms: 78252, dsid: '1,525,493'
    // Black[2,5]  dms: 59408, dsid: '1,033,271' 
    // White[5,4]  dms: 46590, dsid:   '831,365'
    // Black[1,3]  dms: 54325, dsid:   '910,455'
    // White[6,4]  dms: 28171, dsid:   '490,460'
    // Black[1,2]c dms: 47904, dsid:   '746,115'
    // White[3,3]c dms: 13409, dsid:   '212,998'
    // Black[3,4]c dms: 33666, dsid:   '534,352'
    // White[3,1]c dms: 35854, dsid:   '606,603'
    // Black[1,5]  dms: 21588, dsid:   '318,592'
    // White[5,3]  dms: 31454, dsid:   '513,691'
    // Black[3,3]c dms: 31341, dsid:   '454,845'
    // White[4,3]c dms: 26871, dsid:   '410,320'
    // Black[4,6]  dms: 36755, dsid:   '526,062'
    // White []    dms: 21617, dsid: '312,389'

    // (mh:2, nh:2, pW=1) [for [2,2] allDistricts!, and no sxAxis!
    // Black[3,3]
    // White[3,7] dms:  53291, dsid: '1,246,162';
    // Black[3,4] dms: 135829, dsid: '2,925,547';
    // White[5,7] dms: 135156, dsid: '2,946,357';
      /* 3x1: 
10: {Aname: 'BLACK@[1,1]', stoneColor: 'b', hex: {…}}
11: {Aname: 'WHITE@[1,4]', stoneColor: 'w', hex: {…}}
12: {Aname: 'BLACK@[1,4]', stoneColor: 'b', hex: {…}}
13: {Aname: 'WHITE@[3,4]', stoneColor: 'w', hex: {…}}
14: {Aname: 'BLACK@[1,2]', stoneColor: 'b', hex: {…}}
15: {Aname: 'WHITE@[2,3]', stoneColor: 'w', hex: {…}}
16: {Aname: 'BLACK@[3,1]', stoneColor: 'b', hex: {…}} <- Black Resigns
17: {Aname: 'WHITE@[2,4]', stoneColor: 'w', hex: {…}}
18: {Aname: 'BLACK@[1,2]', stoneColor: 'b', hex: {…}}
19: {Aname: 'WHITE@[2,3]', stoneColor: 'w', hex: {…}}
20: {Aname: 'BLACK@[2,1]', stoneColor: 'b', hex: {…}} <- Black Skip! (only one move in log!)
21: {Aname: 'WHITE@[0,4]', stoneColor: 'w', hex: {…}}
22: {Aname: 'BLACK@[1,4]', stoneColor: 'b', hex: {…}}
23: {Aname: 'WHITE@[2,4]', stoneColor: 'w', hex: {…}}
24: {Aname: 'BLACK@[2,4]', stoneColor: 'b', hex: {…}}
25: {Aname: 'WHITE@[3,4]', stoneColor: 'w', hex: {…}}
26: {Aname: 'BLACK@[2,5]', stoneColor: 'b', hex: {…}}
27: {Aname: 'WHITE@[4,4]', stoneColor: 'w', hex: {…}}
28: {Aname: 'BLACK@[4,2]', stoneColor: 'b', hex: {…}}
29: {Aname: 'WHITE@[3,3]', stoneColor: 'w', hex: {…}}
30: {Aname: 'BLACK@[2,2]', stoneColor: 'b', hex: {…}}
31: {Aname: 'WHITE@[1,3]', stoneColor: 'w', hex: {…}}
32: {Aname: 'BLACK@[0,2]', stoneColor: 'b', hex: {…}}

// [2x2]
0: {Aname: 'BLACK@[2,6]', stoneColor: 'b', hex: {…}}
1: {Aname: 'WHITE@[1,6]', stoneColor: 'w', hex: {…}}
2: {Aname: 'BLACK@[7,4]', stoneColor: 'b', hex: {…}}
3: {Aname: 'WHITE@[5,8]', stoneColor: 'w', hex: {…}}
4: {Aname: 'BLACK@[0,6]', stoneColor: 'b', hex: {…}}
5: {Aname: 'WHITE@[4,8]', stoneColor: 'w', hex: {…}}
6: {Aname: 'BLACK@[4,8]', stoneColor: 'b', hex: {…}}
7: {Aname: 'WHITE@[1,5]', stoneColor: 'w', hex: {…}}
8: {Aname: 'BLACK@[5,4]', stoneColor: 'b', hex: {…}}
9: {Aname: 'WHITE@[1,4]', stoneColor: 'w', hex: {…}}
10: {Aname: 'BLACK@[6,5]', stoneColor: 'b', hex: {…}}
11: {Aname: 'WHITE@[2,4]', stoneColor: 'w', hex: {…}}
12: {Aname: 'BLACK@[5,5]', stoneColor: 'b', hex: {…}}
13: {Aname: 'WHITE@[1,6]', stoneColor: 'w', hex: {…}}
14: {Aname: 'BLACK@[6,4]', stoneColor: 'b', hex: {…}}
15: {Aname: 'WHITE@[4,7]', stoneColor: 'w', hex: {…}}
16: {Aname: 'BLACK@[3,5]', stoneColor: 'b', hex: {…}}
17: {Aname: 'WHITE@[5,7]', stoneColor: 'w', hex: {…}}
18: {Aname: 'BLACK@[3,4]', stoneColor: 'b', hex: {…}}
19: {Aname: 'WHITE@[2,8]', stoneColor: 'w', hex: {…}}
20: {Aname: 'BLACK@[0,5]', stoneColor: 'b', hex: {…}}
21: {Aname: 'WHITE@[0,6]', stoneColor: 'w', hex: {…}}
22: {Aname: 'BLACK@[2,5]', stoneColor: 'b', hex: {…}}
23: {Aname: 'WHITE@[1,7]', stoneColor: 'w', hex: {…}}
24: {Aname: 'BLACK@[4,6]', stoneColor: 'b', hex: {…}}
25: {Aname: 'WHITE@[1,8]', stoneColor: 'w', hex: {…}}
26: {Aname: 'BLACK@[4,5]', stoneColor: 'b', hex: {…}}
27: {Aname: 'WHITE@[3,7]', stoneColor: 'w', hex: {…}}
28: {Aname: 'BLACK@[1,4]', stoneColor: 'b', hex: {…}}
29: {Aname: 'WHITE@[2,7]', stoneColor: 'w', hex: {…}}
30: {Aname: 'BLACK@[1,5]', stoneColor: 'b', hex: {…}}
  */
