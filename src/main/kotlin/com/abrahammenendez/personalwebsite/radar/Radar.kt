package com.abrahammenendez.personalwebsite.radar

import com.abrahammenendez.personalwebsite.utils.WithAuditTimestamps
import org.bson.types.ObjectId
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("radar")
data class Radar(
    @Id
    val id: ObjectId = ObjectId.get(),
    val radarEntries: Set<RadarEntry> = emptySet(),
    override var createdOn: Instant? = Instant.now(),
    @Indexed
    override var updatedOn: Instant? = Instant.now(),
) : WithAuditTimestamps
