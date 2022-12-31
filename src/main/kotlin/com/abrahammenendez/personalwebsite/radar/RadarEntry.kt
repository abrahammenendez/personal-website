package com.abrahammenendez.personalwebsite.radar

import com.abrahammenendez.personalwebsite.utils.WithAuditTimestamps
import org.bson.types.ObjectId
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import java.time.Instant

data class RadarEntry(
    @Id
    val id: ObjectId = ObjectId.get(),
    val name: String,
    val description: String,
    val category: RadarEntryCategory,
    val section: RadarEntrySection,
    val includedBy: String,
    val show: Boolean,
    override var createdOn: Instant? = Instant.now(),
    @Indexed
    override var updatedOn: Instant? = Instant.now(),
) : WithAuditTimestamps

enum class RadarEntryCategory {
    LANGUAGES_AND_FRAMEWORKS,
    PLATFORMS,
    TOOLS,
    TECHNIQUES
}

enum class RadarEntrySection {
    TRIED_AND_LIKED,
    TRIED_AND_DISLIKED,
    TO_TRY,
    TRYING
}
