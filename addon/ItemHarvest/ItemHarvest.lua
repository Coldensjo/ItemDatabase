-- Item Harvest
--
-- Most equipment is not in the game files: the server sends an item the first time the client
-- asks about it, and the client keeps the answer in its cache (Cache\ADB\<locale>\DBCache.bin).
-- This addon asks for every item in Missing.lua, a list the website build writes, a few at a time.
-- The cache is written when the game closes, so exit the game afterwards and run update.bat.
--
--   /harvest          start, or show progress
--   /harvest stop     pause (it resumes where it stopped)
--   /harvest reset    start again from the first item

local PER_TICK = 20 -- items asked for per tick
local TICK_SECONDS = 0.5

local ids = {}
for _, range in ipairs(ItemHarvestMissing or {}) do
	for id = range[1], range[2] do
		ids[#ids + 1] = id
	end
end

local ticker
local received = 0

local function say(text)
	print("|cff33ff99Item Harvest|r: " .. text)
end

local function request(id)
	if C_Item and C_Item.RequestLoadItemDataByID then
		C_Item.RequestLoadItemDataByID(id)
	else
		GetItemInfo(id)
	end
end

local function stop(done)
	if ticker then
		ticker:Cancel()
		ticker = nil
	end
	if done then
		say(("finished: asked for %d items, the server answered %d. Exit the game, then run update.bat."):format(#ids, received))
	end
end

local function tick()
	local position = ItemHarvestDB.position
	for _ = 1, PER_TICK do
		position = position + 1
		if position > #ids then
			ItemHarvestDB.position = #ids
			stop(true)
			return
		end
		request(ids[position])
	end
	ItemHarvestDB.position = position
	if position % 1000 < PER_TICK then
		say(("%d of %d"):format(position, #ids))
	end
end

local function start()
	if #ids == 0 then
		say("nothing to ask for: the website already has every item.")
		return
	end
	if ticker then
		say(("running: %d of %d"):format(ItemHarvestDB.position, #ids))
		return
	end
	if ItemHarvestDB.position >= #ids then
		say("already finished. Exit the game and run update.bat, or /harvest reset to ask again.")
		return
	end
	local left = #ids - ItemHarvestDB.position
	say(("asking the server for %d items, about %d minutes. /harvest stop to pause."):format(
		left, math.ceil(left / PER_TICK * TICK_SECONDS / 60)))
	ticker = C_Timer.NewTicker(TICK_SECONDS, tick)
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("GET_ITEM_INFO_RECEIVED")
frame:SetScript("OnEvent", function(_, event, arg1, arg2)
	if event == "ADDON_LOADED" and arg1 == "ItemHarvest" then
		ItemHarvestDB = ItemHarvestDB or {}
		-- A new list (after a patch or a website build) starts from the beginning.
		if ItemHarvestDB.count ~= ItemHarvestMissingCount or ItemHarvestDB.first ~= ids[1] then
			ItemHarvestDB.count = ItemHarvestMissingCount
			ItemHarvestDB.first = ids[1]
			ItemHarvestDB.position = 0
		end
		if #ids > 0 and ItemHarvestDB.position < #ids then
			C_Timer.After(8, function()
				say(("%d items are missing from the website. Type /harvest to fetch them."):format(#ids - ItemHarvestDB.position))
			end)
		end
	elseif event == "GET_ITEM_INFO_RECEIVED" and ticker and arg2 then
		received = received + 1
	end
end)

SLASH_ITEMHARVEST1 = "/harvest"
SLASH_ITEMHARVEST2 = "/itemharvest"
SlashCmdList.ITEMHARVEST = function(message)
	message = (message or ""):lower():match("^%s*(.-)%s*$")
	if message == "stop" then
		stop(false)
		say(("paused at %d of %d"):format(ItemHarvestDB.position, #ids))
	elseif message == "reset" then
		stop(false)
		ItemHarvestDB.position = 0
		say("reset. Type /harvest to start.")
	else
		start()
	end
end
