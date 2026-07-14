export type TempleLocation = {
  name: string
  city: string
  deity: string
  address: string
  latitude: number
  longitude: number
}

// Representative records derived from cclljj/TW_Temple's MIT-licensed temple.tsv.
export const templeLocations: TempleLocation[] = [
  { name: '北海聖安宮', city: '新北市', deity: '孚佑帝君', address: '石門區尖鹿里', latitude: 25.2971, longitude: 121.5708 },
  { name: '王福宮', city: '基隆市', deity: '二府王爺', address: '安樂區湖海路二段', latitude: 25.1671, longitude: 121.7068 },
  { name: '安國寺', city: '臺北市', deity: '釋迦牟尼佛', address: '北投區復興三路', latitude: 25.1597, longitude: 121.4998 },
  { name: '海口福元宮', city: '桃園市', deity: '三府三王公', address: '大園區漁港路', latitude: 25.1085, longitude: 121.2423 },
  { name: '草嶺慶雲宮', city: '宜蘭縣', deity: '玉皇上帝', address: '頭城鎮濱海路', latitude: 24.9697, longitude: 121.925 },
  { name: '福德祠', city: '新竹縣', deity: '福德正神', address: '新豐鄉福興村', latitude: 24.9416, longitude: 121.0352 },
  { name: '富美宮', city: '新竹市', deity: '蕭潘郭三府王爺', address: '北區東大路三段', latitude: 24.8409, longitude: 120.9376 },
  { name: '康寧宮', city: '苗栗縣', deity: '三府王爺', address: '竹南鎮公義里', latitude: 24.7372, longitude: 120.9076 },
  { name: '建興宮', city: '臺中市', deity: '三府千歲', address: '大甲區建興里', latitude: 24.4133, longitude: 120.6144 },
  { name: '興和宮', city: '彰化縣', deity: '五穀先帝', address: '伸港鄉全興村', latitude: 24.1768, longitude: 120.4898 },
  { name: '受聖宮', city: '南投縣', deity: '真武大帝', address: '國姓鄉長福村', latitude: 24.0889, longitude: 120.8876 },
  { name: '福成宮', city: '雲林縣', deity: '關聖帝君', address: '二崙鄉楊賢村', latitude: 23.8127, longitude: 120.4182 },
  { name: '善興宮', city: '嘉義縣', deity: '松樹王', address: '大林鎮三村里', latitude: 23.6285, longitude: 120.4788 },
  { name: '朝陽宮', city: '嘉義市', deity: '五府千歲', address: '東區荖藤里', latitude: 23.5095, longitude: 120.4399 },
  { name: '濟佑宮', city: '臺南市', deity: '保生大帝', address: '白河區蓮潭里', latitude: 23.4092, longitude: 120.4073 },
  { name: '北極殿', city: '高雄市', deity: '玄天上帝', address: '甲仙區小林里', latitude: 23.1503, longitude: 120.6356 },
  { name: '內明禪寺', city: '屏東縣', deity: '釋迦牟尼佛', address: '高樹鄉新豐村', latitude: 22.8724, longitude: 120.6391 },
  { name: '天龍宮', city: '臺東縣', deity: '瑤池金母', address: '長濱鄉樟原村', latitude: 23.4134, longitude: 121.4827 },
  { name: '洛韶慈惠堂', city: '花蓮縣', deity: '瑤池金母', address: '秀林鄉富世村', latitude: 24.2067, longitude: 121.4569 },
  { name: '普濟寺', city: '澎湖縣', deity: '三寶佛', address: '白沙鄉吉貝村', latitude: 23.744, longitude: 119.6133 },
  { name: '財團法人金門官澳龍鳳宮', city: '金門縣', deity: '天上聖母', address: '金沙鎮官澳', latitude: 24.5179, longitude: 118.4126 },
  { name: '忠義廟', city: '連江縣', deity: '開閩尊王', address: '東引鄉中柳村', latitude: 26.3773, longitude: 120.4789 }
]
